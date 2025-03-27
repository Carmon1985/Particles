// Ensure Three.js objects are available
/* global THREE, gsap */

// --- Basic Scene Setup ---
const container = document.getElementById('container');
// Assuming you might have brought back the loading screen from the first example
const loadingScreen = document.getElementById('loading-screen');
let scene, camera, renderer, controls; // controls are optional
let composer, bloomPass; // For post-processing

// --- Particle System Variables ---
let particleGeometry, particleMaterial, particleSystem;
let targetPositions = []; // To store face vertex positions
const particleCount = 15000; // Adjust for performance vs density
const particleTextureUrl = 'assets/particle.png'; // Make sure this path is correct
const modelUrl = 'assets/face_model.glb';       // Make sure this path is correct

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

    // Controls (Optional, but useful for debugging - requires OrbitControls.js)
    // controls = new THREE.OrbitControls(camera, renderer.domElement);
    // controls.enableDamping = true;

    // Loading Manager
    const manager = new THREE.LoadingManager();
    manager.onLoad = () => {
        console.log('Loading sequence complete (may include errors).');
        // Hide loading screen ONLY if particles were successfully created
        // We'll hide it later if mesh is found
    };
    manager.onError = (url) => {
        console.error(`Error loading ${url}`);
        if (loadingScreen) loadingScreen.innerText = `Error loading ${url}. Check console and file paths. Ensure server is running.`;
        // Don't hide loading screen on error
    };
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log(`Loading: ${url} (${itemsLoaded}/${itemsTotal})`);
         if (loadingScreen) loadingScreen.innerText = `Loading ${itemsLoaded}/${itemsTotal}... ${url}`;
    };

    // --- Load Assets ---
    const textureLoader = new THREE.TextureLoader(manager);
    const particleTexture = textureLoader.load(particleTextureUrl,
        () => console.log(`Texture ${particleTextureUrl} loaded successfully.`), // Success callback for texture
        undefined, // Progress callback (handled by manager)
        (err) => console.error(`Error loading texture ${particleTextureUrl}:`, err) // Error callback for texture
    );


    const loader = new THREE.GLTFLoader(manager);
    loader.load(modelUrl, (gltf) => {
        console.log("Model file loaded:", modelUrl, gltf);

        // --- MODIFIED: Use traverse to find the mesh ---
        let faceMesh = null; // Variable to hold the mesh once found

        gltf.scene.traverse(function (child) {
            // Check if we haven't found a mesh yet AND if the current child is a mesh
            if (!faceMesh && child.isMesh) {
                faceMesh = child; // Found the first mesh, assign it
                console.log("Mesh found using traverse! Name:", child.name || "(no name)");
            }
            // Optional: Log all traversed items for debugging
            // console.log("Traversing child:", child.name || '(no name)', "Type:", child.type);
        });

        // Now, check if we actually found a mesh after traversing
        if (!faceMesh) {
            console.error("No mesh found anywhere in the GLTF model hierarchy even after traversing!");
            if (loadingScreen) loadingScreen.innerText = "Error: No usable mesh found in the loaded model file.";
            // Stop processing if no mesh was found
            return;
        }
        // --- END OF MESH FINDING MODIFICATION ---

        // --- If mesh was found, continue processing ---
        console.log("Proceeding with the found mesh...");
        if (loadingScreen) loadingScreen.innerText = "Model mesh found. Processing geometry...";


        // Center and scale the mesh geometry (adjust scale factor as needed)
        faceMesh.geometry.computeBoundingBox(); // Ensure bounding box is calculated
        faceMesh.geometry.center();             // Center the geometry
        const scaleFactor = 2.0; // <<< ADJUST THIS to make the face bigger/smaller
        faceMesh.geometry.scale(scaleFactor, scaleFactor, scaleFactor);
        faceMesh.geometry.computeBoundingBox(); // Recompute bounds after scaling
        console.log("Mesh centered and scaled. Bounding box:", faceMesh.geometry.boundingBox);


        const positions = faceMesh.geometry.attributes.position.array;
        const numVertices = positions.length / 3;

        if (numVertices === 0) {
             console.error("Error: The found mesh geometry has no vertices!");
             if (loadingScreen) loadingScreen.innerText = "Error: Found mesh has no vertex data.";
             return;
        }

        console.log(`Found ${numVertices} vertices in the mesh.`);
        if (loadingScreen) loadingScreen.innerText = `Processing ${numVertices} vertices...`;

        // --- Sample vertices for target positions ---
        targetPositions = []; // Clear previous targets if any
        for (let i = 0; i < particleCount; i++) {
            // Pick a random vertex index
            const randomIndex = Math.floor(Math.random() * numVertices);
            const vertexIndex = randomIndex * 3;
             // Add some small random offset to avoid particles perfectly overlapping
            const offsetX = (Math.random() - 0.5) * 0.02 * scaleFactor; // Scale offset slightly
            const offsetY = (Math.random() - 0.5) * 0.02 * scaleFactor;
            const offsetZ = (Math.random() - 0.5) * 0.02 * scaleFactor;

            // Ensure we don't go out of bounds (shouldn't happen with Math.floor)
             if (vertexIndex + 2 < positions.length) {
                 targetPositions.push(
                     positions[vertexIndex] + offsetX,
                     positions[vertexIndex + 1] + offsetY,
                     positions[vertexIndex + 2] + offsetZ
                 );
             } else {
                 // Fallback if index somehow goes wrong, push origin or last valid point
                 targetPositions.push(0,0,0);
                 console.warn("Potential vertex index issue, using fallback.");
             }

        }

        if (targetPositions.length === 0) {
             console.error("Error: Failed to generate any target positions!");
             if (loadingScreen) loadingScreen.innerText = "Error: Could not generate particle targets.";
             return;
        }


        console.log(`Generated ${targetPositions.length / 3} target positions for particles.`);
        if (loadingScreen) loadingScreen.innerText = `Creating ${particleCount} particles...`;

        // --- Create the particle system ---
        createParticles(particleTexture);

        // --- Setup post-processing and start animation ---
        setupPostProcessing();
        if (loadingScreen) {
             // Optionally fade out the loading screen nicely
             gsap.to(loadingScreen, { opacity: 0, duration: 0.5, onComplete: () => loadingScreen.style.display = 'none' });
        }
        startAnimation(); // Start the particle animation


    }, undefined, (error) => {
        // This is the error callback specifically for GLTFLoader.load itself
        console.error('An error happened during model loading process:', error);
        if (loadingScreen) loadingScreen.innerText = "Error loading model file. Check console.";
    });


    // --- Event Listener ---
    window.addEventListener('resize', onWindowResize, false);
}

// --- Create Particle System ---
function createParticles(texture) {
    // Destroy existing particle system if it exists
    if (particleSystem) {
        scene.remove(particleSystem);
        particleGeometry.dispose();
        particleMaterial.dispose();
    }
    if (targetPositions.length === 0) {
        console.error("Cannot create particles: targetPositions array is empty.");
        return;
    }


    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Initial random positions (spread out, e.g., in a sphere or box)
        const radius = 8 + Math.random() * 5; // Adjust starting distance/spread
        const phi = Math.acos(-1 + (2 * Math.random()));
        const theta = Math.random() * Math.PI * 2;

        positions[i3]     = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi) - 2.0; // Start slightly behind center
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    particleMaterial = new THREE.PointsMaterial({
        size: 0.035, // <<< ADJUST PARTICLE SIZE
        map: texture,
        blending: THREE.AdditiveBlending, // Crucial for light effect
        depthWrite: false, // Helps with additive blending transparency
        transparent: true,
        opacity: 0.75, // <<< ADJUST PARTICLE OPACITY
    });

    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    console.log("Particle system created/updated");
}


// --- Post Processing Setup ---
function setupPostProcessing() {
    // Dispose existing composer if resizing or re-initializing
    if (composer) {
        // You might need to dispose passes if they have internal textures
    }

    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Adjust Bloom parameters for desired glow effect
    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.8, // strength <<< ADJUST BLOOM STRENGTH
        0.5, // radius   <<< ADJUST BLOOM RADIUS (spread)
        0.15 // threshold<<< ADJUST BLOOM THRESHOLD (brightness needed to bloom)
    );
    composer.addPass(bloomPass);

     // Optional: Add a final pass to render to screen if needed, though bloom usually does
     // const copyPass = new THREE.ShaderPass(THREE.CopyShader);
     // copyPass.renderToScreen = true;
     // composer.addPass(copyPass);
     console.log("Post-processing (Bloom) setup complete.");
}

// --- Start GSAP Animation ---
function startAnimation() {
    if (!particleSystem || !targetPositions || targetPositions.length === 0) {
        console.error("Cannot start animation: Particle system or target positions not ready.");
        return;
    }

    const positions = particleGeometry.attributes.position.array;

     // Ensure number of particles matches target positions length
     if (positions.length !== targetPositions.length) {
         console.error(`Position buffer size (${positions.length}) does not match target positions size (${targetPositions.length}). Aborting animation.`);
         // This might indicate an issue during particle creation or target sampling
         return;
     }

    const tl = gsap.timeline({
        // Optional: Add an onComplete callback if needed
        // onComplete: () => console.log("Particle formation animation complete.")
    });

    // Kill previous tweens on the same target if re-running
    gsap.killTweensOf(positions);
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(particleSystem.rotation);


    camera.position.set(0, 0, 5); // Reset camera for animation start
    if(controls) controls.target.set(0,0,0); // Reset orbit controls target

    // Animate Camera slightly pulling back
     tl.to(camera.position, {
         z: 6.5, // Pull back a bit (Adjust as needed)
         duration: animationDuration + staggerDelay * 0.6, // Match overall feel
         ease: "power2.inOut"
     }, 0); // Start at time 0


    // Animate particles to target positions
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Check bounds to prevent errors if arrays mismatch (should be caught earlier)
        if (i3 + 2 >= positions.length || i3 + 2 >= targetPositions.length) {
             console.warn(`Index out of bounds during animation setup for particle ${i}. Skipping.`);
             continue;
         }


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

    // Optional: Rotate the final shape slowly AFTER formation
     gsap.to(particleSystem.rotation, {
        y: Math.PI * 0.6, // Rotate back and forth slightly
        duration: 45,
        repeat: -1, // Infinite repeat
        yoyo: true, // Go back and forth
        ease: "sine.inOut",
        delay: animationDuration + staggerDelay // Start rotating after formation animation ends
    });

     console.log("GSAP animation started");
}

// --- Update Particle Geometry ---
function updateParticles() {
    // This function is called by the GSAP ticker
    if (particleGeometry && particleGeometry.attributes.position) {
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
        // Fallback if composer isn't set up yet
        renderer.render(scene, camera);
    }
}

// --- Handle Window Resize ---
function onWindowResize() {
    if (!camera || !renderer) return; // Don't run if init hasn't completed

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Update composer and bloom pass resolution if they exist
    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight);
    }
     if (bloomPass) {
         // You might adjust bloom parameters based on resolution, but usually not needed
         // bloomPass.resolution.set(window.innerWidth, window.innerHeight);
     }
     console.log("Window resized.");
}

// --- Start ---
try {
    init();
    animate(); // Start the render loop
} catch(err) {
    console.error("Initialization or Animation Loop failed:", err);
    if (loadingScreen) {
        loadingScreen.innerText = "Fatal Error. Check console.";
        loadingScreen.style.display = 'block'; // Ensure loading screen is visible on error
        loadingScreen.style.opacity = '1';
    }
}