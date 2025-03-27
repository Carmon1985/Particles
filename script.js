// Ensure Three.js objects are available
/* global THREE, gsap */

// --- Embedded MeshSurfaceSampler Class ---
// Source: https://github.com/mrdoob/three.js/blob/dev/examples/jsm/math/MeshSurfaceSampler.js
// (Copied here for convenience as it's not in the main three.min.js)
class MeshSurfaceSampler {
	constructor( mesh ) {
		let geometry = mesh.geometry;
		if ( ! geometry.isBufferGeometry || geometry.attributes.position.itemSize !== 3 ) {
			throw new Error( 'MeshSurfaceSampler: Requires BufferGeometry triangle mesh.' );
		}
		if ( geometry.index ) {
			console.warn( 'MeshSurfaceSampler: Converting geometry to non-indexed BufferGeometry.' );
			geometry = geometry.toNonIndexed();
		}
		this.geometry = geometry;
		this.positionAttribute = this.geometry.getAttribute( 'position' );
		this.colorAttribute = this.geometry.getAttribute( 'color' );
		this.weightAttribute = null;
		this.distribution = null;
	}
	setWeightAttribute( name ) {
		this.weightAttribute = name ? this.geometry.getAttribute( name ) : null;
		return this;
	}
	build() {
		const positionAttribute = this.positionAttribute;
		const weightAttribute = this.weightAttribute;
		const faceWeights = new Float32Array( positionAttribute.count / 3 );
		// Accumulate weights for each mesh face.
		for ( let i = 0; i < positionAttribute.count / 3; i ++ ) {
			let faceWeight = 1;
			if ( weightAttribute ) {
				faceWeight = weightAttribute.getX( i * 3 + 0 )
					+ weightAttribute.getX( i * 3 + 1 )
					+ weightAttribute.getX( i * 3 + 2 );
			}
			_face.a.fromBufferAttribute( positionAttribute, i * 3 + 0 );
			_face.b.fromBufferAttribute( positionAttribute, i * 3 + 1 );
			_face.c.fromBufferAttribute( positionAttribute, i * 3 + 2 );
			faceWeight *= _face.getArea();
			faceWeights[ i ] = faceWeight;
		}
		// Store cumulative weights.
		this.distribution = new Float32Array( positionAttribute.count / 3 );
		let cumulativeWeight = 0;
		for ( let i = 0; i < faceWeights.length; i ++ ) {
			cumulativeWeight += faceWeights[ i ];
			this.distribution[ i ] = cumulativeWeight;
		}
		return this;
	}
	sample( targetPosition, targetNormal, targetColor ) {
		const cumulativeTotal = this.distribution[ this.distribution.length - 1 ];
		const faceIndex = this.binarySearch( Math.random() * cumulativeTotal );
		return this.sampleFace( faceIndex, targetPosition, targetNormal, targetColor );
	}
	binarySearch( value ) {
		let low = 0, high = this.distribution.length - 1;
		while ( low < high ) {
			const mid = Math.floor( ( low + high ) / 2 );
			if ( value >= this.distribution[ mid ] ) {
				low = mid + 1;
			} else {
				high = mid;
			}
		}
		return low;
	}
	sampleFace( faceIndex, targetPosition, targetNormal, targetColor ) {
		let u = Math.random();
		let v = Math.random();
		if ( u + v > 1 ) {
			u = 1 - u;
			v = 1 - v;
		}
		_face.a.fromBufferAttribute( this.positionAttribute, faceIndex * 3 + 0 );
		_face.b.fromBufferAttribute( this.positionAttribute, faceIndex * 3 + 1 );
		_face.c.fromBufferAttribute( this.positionAttribute, faceIndex * 3 + 2 );
		targetPosition
			.set( 0, 0, 0 )
			.addScaledVector( _face.a, u )
			.addScaledVector( _face.b, v )
			.addScaledVector( _face.c, 1 - ( u + v ) );
		if ( targetNormal !== undefined ) {
			_face.getNormal( targetNormal );
		}
		if ( targetColor !== undefined && this.colorAttribute !== undefined ) {
			_color.a.fromBufferAttribute( this.colorAttribute, faceIndex * 3 + 0 );
			_color.b.fromBufferAttribute( this.colorAttribute, faceIndex * 3 + 1 );
			_color.c.fromBufferAttribute( this.colorAttribute, faceIndex * 3 + 2 );
			_colorInterpolant
				.set( 0, 0, 0 )
				.addScaledVector( _color.a, u )
				.addScaledVector( _color.b, v )
				.addScaledVector( _color.c, 1 - ( u + v ) );
			targetColor.r = _colorInterpolant.x;
			targetColor.g = _colorInterpolant.y;
			targetColor.b = _colorInterpolant.z;
		}
		return this;
	}
}
const _face = new THREE.Triangle();
const _color = new THREE.Triangle();
const _colorInterpolant = new THREE.Vector3();
// --- End of Embedded MeshSurfaceSampler Class ---


// --- Basic Scene Setup ---
const container = document.getElementById('container');
const loadingScreen = document.getElementById('loading-screen');
let scene, camera, renderer, controls;
let composer, bloomPass;

// --- Particle System Variables ---
let particleGeometry, particleMaterial, particleSystem;
let targetPositions = [];
const particleCount = 35000; // Keep particle count high for surface sampling
const modelUrl = 'assets/face_model.glb';

// --- Animation Variables ---
const animationDuration = 4;
const staggerDelay = 2.5;

// --- Function to Generate Particle Texture ---
// (Keep the function from the previous step)
function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
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

    const manager = new THREE.LoadingManager();
    manager.onLoad = () => console.log('Loading sequence complete.');
    manager.onError = (url) => console.error(`Error loading ${url}`);
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
         if (loadingScreen) loadingScreen.innerText = `Loading ${itemsLoaded}/${itemsTotal}... ${url}`;
    };

    const generatedParticleTexture = createParticleTexture();

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

        if (!faceMesh) { /* Error handling */ return; }
        console.log("Proceeding with the found mesh...");
        if (loadingScreen) loadingScreen.innerText = "Processing geometry...";

        // Convert to non-indexed geometry if necessary for sampler
        if (faceMesh.geometry.index) {
            faceMesh.geometry = faceMesh.geometry.toNonIndexed();
             console.log("Converted mesh geometry to non-indexed for sampler.");
        }

        // Apply transformations *before* sampling
        faceMesh.geometry.computeBoundingBox();
        faceMesh.geometry.center();
        const scaleFactor = 2.0; // Adjust model scale
        faceMesh.geometry.scale(scaleFactor, scaleFactor, scaleFactor);
        faceMesh.updateMatrixWorld(); // IMPORTANT: Update world matrix after scaling/centering


        // --- MODIFIED: Use MeshSurfaceSampler ---
        targetPositions = [];
        const sampler = new MeshSurfaceSampler(faceMesh).build(); // Build the sampler

        const _position = new THREE.Vector3(); // Temporary vector for position
        const _normal = new THREE.Vector3();   // Temporary vector for normal

        const frontNormalThreshold = 0.1; // Minimum Z component of normal to be considered "front" (0 = side, 1 = front, -1 = back) Adjust this! (0.0 to 0.5 is typical)
        let attempts = 0;
        const maxAttempts = particleCount * 5; // Allow more attempts as filtering is stricter

        console.log(`Sampling ${particleCount} particles using MeshSurfaceSampler, filtering for normal.z > ${frontNormalThreshold}`);

        while(targetPositions.length / 3 < particleCount && attempts < maxAttempts) {
            attempts++;
            sampler.sample(_position, _normal); // Get a random surface point and its normal

            // Rotate normal based on mesh's world rotation if necessary
            // (Often not needed if model is loaded upright, but good practice)
            // _normal.transformDirection(faceMesh.matrixWorld).normalize(); // Uncomment if normals seem wrong

            // Check if the normal points towards the camera (positive Z)
            if (_normal.z > frontNormalThreshold) {
                // Add a very small random offset if desired (less needed with surface sampling)
                 const offsetX = (Math.random() - 0.5) * 0.005 * scaleFactor;
                 const offsetY = (Math.random() - 0.5) * 0.005 * scaleFactor;
                 const offsetZ = (Math.random() - 0.5) * 0.005 * scaleFactor;

                targetPositions.push(
                    _position.x + offsetX,
                    _position.y + offsetY,
                    _position.z + offsetZ
                );
            }
        } // End while

        if (targetPositions.length / 3 < particleCount) {
            console.warn(`Could only find ${targetPositions.length / 3} front-facing samples after ${attempts} attempts. Adjust frontNormalThreshold (${frontNormalThreshold}) or check model orientation/normals.`);
        }
         if (attempts >= maxAttempts) {
             console.warn(`Max sampling attempts reached (${attempts}).`);
         }
         // --- END OF MeshSurfaceSampler MODIFICATION ---


         if (targetPositions.length === 0) { /* Error handling */ return; }

        console.log(`Generated ${targetPositions.length / 3} target positions.`);
        if (loadingScreen) loadingScreen.innerText = `Creating ${particleCount} particles...`;

        createParticles(generatedParticleTexture);
        setupPostProcessing();
        if (loadingScreen) { /* Hide loading screen */ }
        startAnimation();

    }, undefined, (error) => { /* Error handling */ });

    window.addEventListener('resize', onWindowResize, false);
}

// --- createParticles function --- (Keep the version from the previous step)
function createParticles(texture) {
    if (particleSystem) { /* Dispose existing */ }
     if (!targetPositions || targetPositions.length === 0) { return; }

    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    // Initial random positions
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const radius = 8 + Math.random() * 5;
        const phi = Math.acos(-1 + (2 * Math.random()));
        const theta = Math.random() * Math.PI * 2;
        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi) - 2.0;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    particleMaterial = new THREE.PointsMaterial({
        map: texture,
        size: 0.04, // <<< ADJUST
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.75, // <<< ADJUST
        sizeAttenuation: true
    });

    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
    console.log("Particle system created/updated");
}

// --- setupPostProcessing function --- (Keep the version from the previous step)
function setupPostProcessing() {
     if (composer) { /* Dispose */ }
    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.9, // strength <<< ADJUST
        0.5, // radius
        0.15 // threshold
    );
    composer.addPass(bloomPass);
    console.log("Post-processing setup complete.");
}


// --- startAnimation function --- (Keep the version WITHOUT rotation from the previous step)
function startAnimation() {
    if (!particleSystem || !targetPositions || targetPositions.length === 0) { return; }
    const positions = particleGeometry.attributes.position.array;
     if (positions.length !== targetPositions.length) { return; }
    const tl = gsap.timeline();
    gsap.killTweensOf(positions);
    gsap.killTweensOf(camera.position);
    camera.position.set(0, 0, 5);
    if(controls) controls.target.set(0,0,0);
    tl.to(camera.position, { z: 6.5, duration: animationDuration + staggerDelay * 0.6, ease: "power2.inOut" }, 0);
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        if (i3 + 2 >= positions.length || i3 + 2 >= targetPositions.length) continue;
        tl.to(positions, { [i3]: targetPositions[i3], [i3 + 1]: targetPositions[i3 + 1], [i3 + 2]: targetPositions[i3 + 2], duration: animationDuration, ease: "power3.inOut", delay: Math.random() * staggerDelay }, 0);
    }
    gsap.ticker.add(updateParticles);
    console.log("GSAP animation started (no final rotation)");
}


// --- updateParticles function --- (Keep as is)
function updateParticles() {
    if (particleGeometry && particleGeometry.attributes.position) {
        particleGeometry.attributes.position.needsUpdate = true;
    }
}

// --- animate function --- (Keep as is)
function animate() {
    requestAnimationFrame(animate);
    if (composer) composer.render();
    else renderer.render(scene, camera);
}

// --- onWindowResize function --- (Keep as is)
function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    console.log("Window resized.");
}

// --- Start --- (Keep as is)
try {
    init();
    animate();
} catch(err) {
    console.error("Initialization or Animation Loop failed:", err);
    if (loadingScreen) { /* Error display */ }
}