// Ensure Three.js objects are available
/* global THREE, gsap */

// --- Basic Scene Setup ---
const container = document.getElementById('container');
const loadingScreen = document.getElementById('loading-screen');
let scene, camera, renderer, controls;
let composer, bloomPass;

// --- Particle System Variables ---
let particleGeometry, particleMaterial, particleSystem;
let targetPositions = [];
const particleCount = 35000; // <<< Increased particle count for better coverage
const modelUrl = 'assets/face_model.glb'; // Make sure this path is correct
// We will generate the texture, so no URL needed here

// --- Animation Variables ---
const animationDuration = 4;
const staggerDelay = 2.5;

// --- Function to Generate Particle Texture ---
function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; // Texture dimension
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0, // Inner circle (fully white)
        canvas.width / 2, canvas.height / 2, canvas.width / 2 // Outer circle (fully transparent)
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');   // Center is white
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)'); // Fades out
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');   // Edge is transparent

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    // No need for texture.needsUpdate = true; for CanvasTexture
    console.log("Generated particle texture using Canvas.");
    return texture;
}


// --- Initialization ---
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000);
    container.appendChild(renderer.domElement);

    // controls = new THREE.OrbitControls(camera, renderer.domElement); // Optional
    // controls.enableDamping = true;

    const manager = new THREE.LoadingManager();
     manager.onLoad = () => console.log('Loading sequence complete.');
     manager.onError = (url) => console.error(`Error loading ${url}`);
     manager.onProgress = (url, itemsLoaded, itemsTotal) => {
         console.log(`Loading: ${url} (${itemsLoaded}/${itemsTotal})`);
         if (loadingScreen) loadingScreen.innerText = `Loading ${itemsLoaded}/${itemsTotal}... ${url}`;
     };

    // --- Generate Particle Texture (instead of loading) ---
    const generatedParticleTexture = createParticleTexture();

    // --- Load Model ---
    const loader = new THREE.GLTFLoader(manager);
    loader.load(modelUrl, (gltf) => {
        console.log("Model file loaded:", modelUrl);

        let faceMesh = null;
        gltf.scene.traverse(function (child) {
            if (!faceMesh && child.isMesh) {
                faceMesh = child;
                console.log("Mesh found using traverse! Name:", child.name || "(no name)");
            }
        });

        if (!faceMesh) {
            console.error("No mesh found in GLTF model hierarchy!");
            if (loadingScreen) loadingScreen.innerText = "Error: No usable mesh found in model.";
            return;
        }

        console.log("Proceeding with the found mesh...");
        if (loadingScreen) loadingScreen.innerText = "Processing geometry...";

        faceMesh.geometry.computeBoundingBox();
        faceMesh.geometry.center();
        const scaleFactor = 2.0; // <<< ADJUST MODEL SCALE if needed
        faceMesh.geometry.scale(scaleFactor, scaleFactor, scaleFactor);
        faceMesh.geometry.computeBoundingBox(); // Recompute after scaling

        const positions = faceMesh.geometry.attributes.position.array;
        const numVertices = positions.length / 3;

        if (numVertices === 0) {
             console.error("Error: The found mesh geometry has no vertices!");
             if (loadingScreen) loadingScreen.innerText = "Error: Mesh has no vertex data.";
             return;
        }
        console.log(`Found ${numVertices} vertices.`);

        // --- Sample front-facing vertices ---
        targetPositions = [];
        const frontThresholdZ = -0.2 * scaleFactor; // Tweak this threshold
        let attempts = 0;
        const maxAttemptsPerParticle = 100;

        console.log(`Sampling ${particleCount} particles, filtering for Z > ${frontThresholdZ.toFixed(3)}`);

        while (targetPositions.length / 3 < particleCount && attempts < particleCount * maxAttemptsPerParticle) {
            attempts++;
            const randomIndex = Math.floor(Math.random() * numVertices);
            const vertexIndex = randomIndex * 3;
            if (vertexIndex + 2 >= positions.length) continue;
            const vertexZ = positions[vertexIndex + 2];

            if (vertexZ > frontThresholdZ) {
                const offsetX = (Math.random() - 0.5) * 0.02 * scaleFactor;
                const offsetY = (Math.random() - 0.5) * 0.02 * scaleFactor;
                const offsetZ = (Math.random() - 0.5) * 0.02 * scaleFactor;
                targetPositions.push(
                    positions[vertexIndex] + offsetX,
                    positions[vertexIndex + 1] + offsetY,
                    positions[vertexIndex + 2] + offsetZ
                );
            }
        } // End while

         if (targetPositions.length / 3 < particleCount) {
            console.warn(`Could only find ${targetPositions.length / 3} front-facing vertices. Adjust threshold?`);
        }
         if (attempts >= particleCount * maxAttemptsPerParticle) {
             console.warn(`Max attempts reached. Some particles might be missing.`);
         }

         if (targetPositions.length === 0) {
             console.error("Error: Failed to generate any target positions!");
             if (loadingScreen) loadingScreen.innerText = "Error: No particle targets generated.";
             return;
         }

        console.log(`Generated ${targetPositions.length / 3} target positions.`);
        if (loadingScreen) loadingScreen.innerText = `Creating ${particleCount} particles...`;

        // --- Create Particles using the generated texture ---
        createParticles(generatedParticleTexture); // Pass the generated texture

        setupPostProcessing();
        if (loadingScreen) {
             gsap.to(loadingScreen, { opacity: 0, duration: 0.5, onComplete: () => loadingScreen.style.display = 'none' });
        }
        startAnimation();

    }, undefined, (error) => {
        console.error('Error loading model file:', error);
        if (loadingScreen) loadingScreen.innerText = "Error loading model. Check console.";
    });

    window.addEventListener('resize', onWindowResize, false);
}

// --- Create Particle System ---
function createParticles(texture) { // Texture is passed in now
    if (particleSystem) {
        scene.remove(particleSystem);
        particleGeometry.dispose();
        particleMaterial.dispose();
    }
     if (!targetPositions || targetPositions.length === 0) {
        console.error("Cannot create particles: targetPositions empty.");
        return;
    }

    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    // Initial random positions
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const radius = 8 + Math.random() * 5;
        const phi = Math.acos(-1 + (2 * Math.random()));
        const theta = Math.random() * Math.PI * 2;
        positions[i3]     = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi) - 2.0;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // --- CRITICAL MATERIAL SETTINGS ---
    particleMaterial = new THREE.PointsMaterial({
        map: texture,                   // Use the generated texture
        size: 0.04,                    // <<< ADJUST PARTICLE SIZE (try smaller/larger)
        blending: THREE.AdditiveBlending, // <<< CORRECT BLENDING for light
        depthWrite: false,              // <<< CORRECT DEPTH WRITE for blending
        transparent: true,              // <<< Needed for blending/opacity
        opacity: 0.75,                  // <<< ADJUST OPACITY (0.0 to 1.0)
        sizeAttenuation: true           // Makes particles smaller further away (usually desired)
    });
    // --- END CRITICAL SETTINGS ---

    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
    console.log("Particle system created/updated");
}


// --- Post Processing Setup ---
function setupPostProcessing() {
    if (composer) { /* Dispose if necessary */ }
    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.9, // strength <<< ADJUST BLOOM
        0.5, // radius
        0.15 // threshold
    );
    composer.addPass(bloomPass);
    console.log("Post-processing setup complete.");
}

// --- Start GSAP Animation ---
function startAnimation() {
    if (!particleSystem || !targetPositions || targetPositions.length === 0) {
        console.error("Cannot start animation: System/targets not ready.");
        return;
    }
    const positions = particleGeometry.attributes.position.array;
     if (positions.length !== targetPositions.length) {
         console.error(`Position buffer size (${positions.length}) != target size (${targetPositions.length}).`);
         return;
     }

    const tl = gsap.timeline();
    gsap.killTweensOf(positions); // Kill previous tweens
    gsap.killTweensOf(camera.position);
    // No need to kill rotation tween as we won't create it

    camera.position.set(0, 0, 5);
    if(controls) controls.target.set(0,0,0);

    // Camera pull back
     tl.to(camera.position, {
         z: 6.5, // Adjust zoom
         duration: animationDuration + staggerDelay * 0.6,
         ease: "power2.inOut"
     }, 0);

    // Particle movement
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        if (i3 + 2 >= positions.length || i3 + 2 >= targetPositions.length) continue;
        tl.to(positions, {
            [i3]: targetPositions[i3],
            [i3 + 1]: targetPositions[i3 + 1],
            [i3 + 2]: targetPositions[i3 + 2],
            duration: animationDuration,
            ease: "power3.inOut",
            delay: Math.random() * staggerDelay
        }, 0);
    }

    gsap.ticker.add(updateParticles); // Ensure updates happen

    // --- REMOVED ROTATION ---
    // The gsap.to(particleSystem.rotation, ...) block has been deleted.

     console.log("GSAP animation started (no final rotation)");
}

// --- Update Particle Geometry ---
function updateParticles() {
    if (particleGeometry && particleGeometry.attributes.position) {
        particleGeometry.attributes.position.needsUpdate = true;
    }
    // if (controls) controls.update();
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    if (composer) composer.render();
    else renderer.render(scene, camera);
}

// --- Handle Window Resize ---
function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    // if (bloomPass) { /* Adjust if needed */ }
    console.log("Window resized.");
}

// --- Start ---
try {
    init();
    animate();
} catch(err) {
    console.error("Initialization or Animation Loop failed:", err);
    if (loadingScreen) {
        loadingScreen.innerText = "Fatal Error. Check console.";
        loadingScreen.style.display = 'block';
        loadingScreen.style.opacity = '1';
    }
}