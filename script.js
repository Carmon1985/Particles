// Ensure Three.js objects are available
/* global THREE, gsap */

// --- Basic Scene Setup ---
const container = document.getElementById('container');
const loadingScreen = document.getElementById('loading-screen');
let scene, camera, renderer, controls;
let composer, bloomPass; // For post-processing

// --- Particle System Variables ---
let particleGeometry, particleMaterial, particleSystem;
let targetPositions = []; // To store face vertex positions
const particleCount = 15000; // Adjust for performance vs density
const particleTextureUrl = 'assets/particle.png';
const modelUrl = 'assets/face_model.glb'; // IMPORTANT: Path to your model

// --- Animation Variables ---
const animationDuration = 4; // seconds
const staggerDelay = 2.5; // seconds for all particles to start moving


// --- Initialization ---
function init() {
    // Scene
    scene = new THREE.Scene();
    // scene.fog = new THREE.FogExp2(0x000000, 0.001); // Optional fog

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5; // Start further back initially

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000);
    container.appendChild(renderer.domElement);

    // Controls (Optional, but useful for debugging)
    // controls = new THREE.OrbitControls(camera, renderer.domElement);
    // controls.enableDamping = true;

    // Loading Manager
    const manager = new THREE.LoadingManager();
    manager.onLoad = () => {
        console.log('Assets loaded!');
        if (loadingScreen) loadingScreen.style.display = 'none'; // Hide loading screen
        startAnimation(); // Start the particle animation only after loading
    };
    manager.onError = (url) => {
        console.error(`Error loading ${url}`);
        if (loadingScreen) loadingScreen.innerText = `Error loading ${url}. Check console and file paths.`;
    };
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log(`Loading: ${url} (${itemsLoaded}/${itemsTotal})`);
         if (loadingScreen) loadingScreen.innerText = `Loading ${itemsLoaded}/${itemsTotal}...`;
    };


    // --- Load Assets ---
    const textureLoader = new THREE.TextureLoader(manager);
    const particleTexture = textureLoader.load(particleTextureUrl);

    const loader = new THREE.GLTFLoader(manager);
    loader.load(modelUrl, (gltf) => {
        console.log("Model loaded", gltf);
        const faceMesh = gltf.scene.children.find(child => child.isMesh); // Find the first mesh

        if (!faceMesh) {
            console.error("No mesh found in the GLTF model!");
            if (loadingScreen) loadingScreen.innerText = "Error: No mesh found in model.";
            return;
        }

        // Center and scale the mesh geometry if needed (adjust scale factor)
        faceMesh.geometry.center();
        const scaleFactor = 2; // Adjust this to fit your model size
        faceMesh.geometry.scale(scaleFactor, scaleFactor, scaleFactor);


        const positions = faceMesh.geometry.attributes.position.array;
        const numVertices = positions.length / 3;

        // Sample vertices if particleCount is different from numVertices
        for (let i = 0; i < particleCount; i++) {
            // Pick a random vertex index
            const randomIndex = Math.floor(Math.random() * numVertices);
            const vertexIndex = randomIndex * 3;
             // Add some small random offset to avoid particles perfectly overlapping
            const offsetX = (Math.random() - 0.5) * 0.05;
            const offsetY = (Math.random() - 0.5) * 0.05;
            const offsetZ = (Math.random() - 0.5) * 0.05;

            targetPositions.push(
                positions[vertexIndex] + offsetX,
                positions[vertexIndex + 1] + offsetY,
                positions[vertexIndex + 2] + offsetZ
            );
        }

        console.log(`Using ${targetPositions.length / 3} target positions.`);
        createParticles(particleTexture);

    }, undefined, (error) => {
        console.error('An error happened during model loading:', error);
        if (loadingScreen) loadingScreen.innerText = "Error loading model. Check console.";
    });

    // --- Post Processing (Bloom) ---
    setupPostProcessing();


    // --- Event Listener ---
    window.addEventListener('resize', onWindowResize, false);
}

// --- Create Particle System ---
function createParticles(texture) {
    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const initialPositions = new Float32Array(particleCount * 3); // Store starting points

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Initial random positions (spread out, e.g., in a sphere or box)
        const radius = 10; // Adjust starting radius
        const phi = Math.acos(-1 + (2 * Math.random()));
        const theta = Math.sqrt(4 * Math.PI) * Math.random(); // More uniform sphere points

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi) + camera.position.z - radius*0.8; // Start somewhat in front

        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;

        initialPositions[i3] = x;
        initialPositions[i3 + 1] = y;
        initialPositions[i3 + 2] = z;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Store initial positions as a separate attribute if needed later, or just keep the array
    particleGeometry.userData.initialPositions = initialPositions;

    particleMaterial = new THREE.PointsMaterial({
        size: 0.05, // Adjust particle size
        map: texture,
        blending: THREE.AdditiveBlending, // Crucial for light effect
        depthWrite: false, // Helps with additive blending transparency
        transparent: true,
        opacity: 0.75, // Adjust opacity
        // vertexColors: false // Set to true if you want to color particles individually
    });

    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    console.log("Particle system created");
    // Animation will be started by the loading manager's onLoad callback
}


// --- Post Processing Setup ---
function setupPostProcessing() {
    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.0, // strength (adjust!)
        0.3, // radius (adjust!)
        0.1  // threshold (adjust!)
    );
    composer.addPass(bloomPass);

     // Optional: Add a final pass to render to screen if needed, though bloom usually does
     // const copyPass = new THREE.ShaderPass(THREE.CopyShader);
     // copyPass.renderToScreen = true;
     // composer.addPass(copyPass);
}

// --- Start GSAP Animation ---
function startAnimation() {
    if (!particleSystem) return; // Don't animate if particles aren't ready

    const positions = particleGeometry.attributes.position.array;
    const tl = gsap.timeline();

    camera.position.set(0, 0, 5); // Reset camera for animation start

    // Animate Camera slightly pulling back
     tl.to(camera.position, {
         z: 6.5, // Pull back a bit
         duration: animationDuration + staggerDelay * 0.5, // Match overall feel
         ease: "power2.inOut"
     }, 0); // Start at time 0


    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Target position for this particle
        const targetX = targetPositions[i3];
        const targetY = targetPositions[i3 + 1];
        const targetZ = targetPositions[i3 + 2];

        // GSAP tween for each particle's position components
        tl.to(positions, {
            [i3]: targetX, // Target the specific index in the Float32Array
            [i3 + 1]: targetY,
            [i3 + 2]: targetZ,
            duration: animationDuration,
            ease: "power3.inOut", // Smooth easing
            delay: Math.random() * staggerDelay // Random delay for each particle
        }, 0); // Start all tweens near time 0, rely on delay for staggering
    }

    // Tell Three.js to update the particle positions on each frame
    // We use GSAP's ticker for this synchronization
    gsap.ticker.add(updateParticles);

    // Optional: Rotate the final shape slowly
     gsap.to(particleSystem.rotation, {
        y: Math.PI * 2,
        duration: 40,
        repeat: -1, // Infinite repeat
        ease: "none",
        delay: animationDuration + staggerDelay // Start rotating after formation
    });

     console.log("GSAP animation started");
}

// --- Update Particle Geometry ---
function updateParticles() {
    if (particleGeometry) {
        particleGeometry.attributes.position.needsUpdate = true; // VERY IMPORTANT
    }
     // if (controls) controls.update(); // Update controls if enabled
}


// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    // Render using composer if post-processing is enabled
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

// --- Handle Window Resize ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight); // Update composer size too

    // Adjust bloom parameters maybe? (Optional)
    // bloomPass.resolution.set(window.innerWidth, window.innerHeight);
}

// --- Start ---
init();
animate(); // Start the render loop