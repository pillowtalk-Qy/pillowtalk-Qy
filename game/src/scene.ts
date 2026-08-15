import * as THREE from "three";

export type EvidenceScene = {
  setResolution: (value: number) => void;
  pulse: (tone: "verified" | "rejected" | "unresolved") => void;
  info: () => { frames: number; calls: number; triangles: number; textureReady: boolean };
  destroy: () => void;
};

export function createEvidenceScene(canvas: HTMLCanvasElement, textureUrl: string): EvidenceScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.setClearColor(0x070709, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070709, 0.065);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 9.4);

  let textureReady = false;
  const texture = new THREE.TextureLoader().load(textureUrl, (loaded) => {
    loaded.colorSpace = THREE.SRGBColorSpace;
    textureReady = true;
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const portraitMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uResolution: { value: 0.06 },
      uPulse: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uResolution;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin((p.y * 5.0) + uTime * 0.45) * 0.035 * (1.0 - uResolution);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform float uTime;
      uniform float uResolution;
      uniform vec3 uPulse;
      varying vec2 vUv;
      void main() {
        float cells = mix(24.0, 180.0, uResolution);
        vec2 uv = floor(vUv * cells) / cells;
        float shift = sin((uv.y * 67.0) + uTime * 1.8) * 0.0028 * (1.0 - uResolution);
        float r = texture2D(uTexture, uv + vec2(shift, 0.0)).r;
        float g = texture2D(uTexture, uv).g;
        float b = texture2D(uTexture, uv - vec2(shift, 0.0)).b;
        float gray = dot(vec3(r, g, b), vec3(0.299, 0.587, 0.114));
        float gate = step(mix(0.58, 0.16, uResolution), gray + uResolution * 0.18);
        vec3 violet = vec3(0.47, 0.18, 0.82);
        vec3 cyan = vec3(0.16, 0.72, 0.80);
        vec3 ink = mix(violet, cyan, smoothstep(0.15, 0.85, gray));
        vec3 color = mix(vec3(gray * 0.38), ink * (0.58 + gray), 0.52 + uResolution * 0.38);
        color += uPulse;
        float scan = 0.86 + 0.14 * sin(vUv.y * 900.0);
        float alpha = mix(0.28, 0.86, uResolution) * gate * scan;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const portrait = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 4.7, 32, 24), portraitMaterial);
  portrait.position.set(0.25, 0, -0.6);
  scene.add(portrait);

  const particleCount = 900;
  const particlePositions = new Float32Array(particleCount * 3);
  for (let index = 0; index < particleCount; index += 1) {
    const radius = 3.4 + Math.random() * 5.6;
    const angle = Math.random() * Math.PI * 2;
    particlePositions[index * 3] = Math.cos(angle) * radius;
    particlePositions[index * 3 + 1] = (Math.random() - 0.5) * 7.4;
    particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 4.8 - 1.5;
  }
  const particlesGeometry = new THREE.BufferGeometry();
  particlesGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(
    particlesGeometry,
    new THREE.PointsMaterial({ color: 0x66e3e8, size: 0.022, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  scene.add(particles);

  const ringGroup = new THREE.Group();
  [3.25, 4.15, 5.1].forEach((radius, index) => {
    const curve = new THREE.EllipseCurve(0, 0, radius, radius * (0.43 + index * 0.05), 0, Math.PI * 2);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(180));
    const material = new THREE.LineBasicMaterial({ color: index === 1 ? 0xa767ff : 0x66e3e8, transparent: true, opacity: 0.13 });
    const ring = new THREE.LineLoop(geometry, material);
    ring.rotation.x = 0.22 + index * 0.18;
    ring.rotation.z = index * 0.72;
    ringGroup.add(ring);
  });
  ringGroup.position.z = -0.2;
  scene.add(ringGroup);

  let targetResolution = 0.06;
  let frames = 0;
  let pulseTarget = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  let animationFrame = 0;

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const compact = width < 680;
    portrait.scale.setScalar(compact ? 0.8 : 1);
    portrait.position.x = compact ? 0.1 : 0.25;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const onPointerMove = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const animate = (time: number) => {
    frames += 1;
    portraitMaterial.uniforms.uTime.value = time / 1000;
    portraitMaterial.uniforms.uResolution.value = THREE.MathUtils.lerp(portraitMaterial.uniforms.uResolution.value, targetResolution, 0.035);
    const pulse = portraitMaterial.uniforms.uPulse.value as THREE.Vector3;
    pulse.lerp(pulseTarget, 0.08);
    pulseTarget.multiplyScalar(0.93);
    particles.rotation.z = time * 0.000018;
    ringGroup.rotation.z = time * 0.000055;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.24, 0.025);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.y * 0.16, 0.025);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);

  return {
    setResolution(value) {
      targetResolution = THREE.MathUtils.clamp(0.06 + value * 0.94, 0.06, 1);
    },
    pulse(tone) {
      pulseTarget = tone === "verified"
        ? new THREE.Vector3(0.04, 0.19, 0.2)
        : tone === "rejected"
          ? new THREE.Vector3(0.26, 0.01, 0.04)
          : new THREE.Vector3(0.18, 0.08, 0.28);
    },
    info() {
      return { frames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textureReady };
    },
    destroy() {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      particlesGeometry.dispose();
      portrait.geometry.dispose();
      portraitMaterial.dispose();
      texture.dispose();
    },
  };
}
