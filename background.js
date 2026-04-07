// ============================================
//   NEON CYBER NEURAL MESH - Safe Her
// ============================================

const canvas = document.getElementById('bg-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// --- Configuration ---
const gridCount = 14; 
const nodeCount = gridCount * gridCount;
const connectionDistance = 2.4;
const mouseInfluence = 4.0;
const waveFrequency = 0.5;
const waveAmplitude = 0.4;
const cyanColor = 0x00f5d4;

// --- Node Setup ---
const nodes = [];
for (let x = 0; x < gridCount; x++) {
    for (let z = 0; z < gridCount; z++) {
        const posX = (x - gridCount / 2) * 1.2;
        const posZ = (z - gridCount / 2) * 1.2;
        nodes.push({
            origPos: new THREE.Vector3(posX, 0, posZ),
            pos: new THREE.Vector3(posX, 0, posZ),
            vel: new THREE.Vector3(0, 0, 0),
            phase: (x + z) * 0.3
        });
    }
}

// --- Generate Soft Glowing Dot Texture ---
function createCircleTexture() {
    const size = 128;
    const canvasRef = document.createElement('canvas');
    canvasRef.width = size;
    canvasRef.height = size;
    const context = canvasRef.getContext('2d');

    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(0, 245, 212, 0.6)'); // Cyan
    gradient.addColorStop(0.5, 'rgba(0, 180, 150, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvasRef);
    return texture;
}

// --- Particles (Nodes) ---
const particlesGeometry = new THREE.BufferGeometry();
const particlesMaterial = new THREE.PointsMaterial({
    size: 0.2,
    map: createCircleTexture(),
    transparent: true,
    color: cyanColor,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particlesMesh);

// --- Connections (Lines) ---
const maxConnections = nodeCount * 12;
const lineGeometry = new THREE.BufferGeometry();
const linePositions = new Float32Array(maxConnections * 6);
const lineColors = new Float32Array(maxConnections * 6);
lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
scene.add(lineSegments);

camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// --- Interaction ---
const mouse = new THREE.Vector3(0, 0, -100);
window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Avoid errors if changing section calls this
window.changeBgMode = (mode) => console.log("Mode:", mode);

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    const mouseProj = new THREE.Vector3(mouse.x * 10, 0, -mouse.y * 10);

    const positions = new Float32Array(nodeCount * 3);

    nodes.forEach((node, i) => {
        // 1. Sinusoidal Wave Motion
        const waveY = Math.sin(time * waveFrequency + node.phase) * waveAmplitude;
        
        // 2. Mouse Warp/Pull
        const distToMouse = node.pos.distanceTo(mouseProj);
        const warp = new THREE.Vector3();
        if (distToMouse < mouseInfluence) {
            const pullFactor = (1 - distToMouse / mouseInfluence) * 0.8;
            warp.copy(mouseProj).sub(node.pos).multiplyScalar(pullFactor);
            warp.y += pullFactor * 2.0; // Pull upwards too for "warp" effect
        }

        // Apply Position
        node.pos.copy(node.origPos);
        node.pos.y += waveY;
        node.pos.add(warp);

        positions[i * 3] = node.pos.x;
        positions[i * 3 + 1] = node.pos.y;
        positions[i * 3 + 2] = node.pos.z;
    });

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 3. Update Lines
    const linePosArr = lineGeometry.attributes.position.array;
    const lineColArr = lineGeometry.attributes.color.array;
    let lineIdx = 0;

    for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < nodeCount; j++) {
            const dist = nodes[i].pos.distanceTo(nodes[j].pos);
            if (dist < connectionDistance && lineIdx < maxConnections) {
                const alpha = (1.0 - (dist / connectionDistance)) * 0.8;
                const cyan = new THREE.Color(cyanColor);

                linePosArr[lineIdx * 6] = nodes[i].pos.x;
                linePosArr[lineIdx * 6 + 1] = nodes[i].pos.y;
                linePosArr[lineIdx * 6 + 2] = nodes[i].pos.z;
                linePosArr[lineIdx * 6 + 3] = nodes[j].pos.x;
                linePosArr[lineIdx * 6 + 4] = nodes[j].pos.y;
                linePosArr[lineIdx * 6 + 5] = nodes[j].pos.z;

                lineColArr[lineIdx * 6] = cyan.r * alpha;
                lineColArr[lineIdx * 6 + 1] = cyan.g * alpha;
                lineColArr[lineIdx * 6 + 2] = cyan.b * alpha;
                lineColArr[lineIdx * 6 + 3] = cyan.r * alpha;
                lineColArr[lineIdx * 6 + 4] = cyan.g * alpha;
                lineColArr[lineIdx * 6 + 5] = cyan.b * alpha;

                lineIdx++;
            }
        }
    }

    // Reset unused lines
    for (let k = lineIdx * 6; k < maxConnections * 6; k++) linePosArr[k] = 0;

    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
