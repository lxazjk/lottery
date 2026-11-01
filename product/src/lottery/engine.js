// The original project's Three.js CSS3D sphere, adapted to a dedicated,
// responsive number stage. Selection and persistence use browser storage.
let renderer, scene, camera, controls, observer, host, frame;
let previousTime = 0;
let spinning = false;
let disposed = true;
const cards = [];

function boot(container, numbers) {
  dispose();
  disposed = false;
  host = container;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 1, 10000);
  camera.position.z = 2120;
  renderer = new THREE.CSS3DRenderer();
  renderer.domElement.className = "number-renderer";
  host.appendChild(renderer.domElement);

  numbers.forEach((number, i) => {
    const element = document.createElement("div");
    element.className = "number-card";
    element.dataset.number = number;
    const label = document.createElement("span");
    label.className = "card-label";
    label.textContent = "LUCKY NUMBER";
    const value = document.createElement("strong");
    value.textContent = String(number).padStart(3, "0");
    const foot = document.createElement("i");
    foot.className = "card-star";
    foot.textContent = "✦";
    element.append(label, value, foot);

    const object = new THREE.CSS3DObject(element);
    const phi = Math.acos(-1 + (2 * (i + 0.5)) / numbers.length);
    const theta = Math.sqrt(numbers.length * Math.PI) * phi;
    object.position.setFromSphericalCoords(570, phi, theta);
    object.lookAt(object.position.clone().multiplyScalar(2));
    scene.add(object);
    cards.push(object);
  });
  scene.rotation.x = 0.07;
  scene.rotation.y = 0.4;
  controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 0.25;
  controls.noZoom = true;
  controls.noPan = true;
  controls.noRotate = true;
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    // Keep the entire sphere visible on narrow displays.
    camera.position.z =
      width < height ? (2120 * height) / Math.max(width, 1) : 2120;
    renderer.setSize(width, height);
  };
  observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  previousTime = performance.now();
  function animate(now) {
    if (disposed) return;
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scene.rotation.y +=
      delta * (spinning ? (reduce ? 0.45 : 3.6) : reduce ? 0 : 0.065);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }
  frame = requestAnimationFrame(animate);
}

function spin() {
  spinning = true;
}
function stop() {
  spinning = false;
}
function markWinners(numbers) {
  const used = new Set(numbers);
  cards.forEach((object) =>
    object.element.classList.toggle(
      "drawn",
      used.has(Number(object.element.dataset.number)),
    ),
  );
}
function dispose() {
  disposed = true;
  spinning = false;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  controls?.dispose?.();
  if (host) host.replaceChildren();
  cards.length = 0;
}
export const engine = { boot, spin, stop, markWinners, dispose };
