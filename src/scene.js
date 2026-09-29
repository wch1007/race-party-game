import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { TRACK, COLORS, CHARACTERS, definition, active } from "./game.js";

const TAU = Math.PI * 2;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const material = (color, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness });
const ease = (t) => 1 - (1 - t) ** 3;
export function trackPoint(index) {
  const straight = 22,
    r = 7.6,
    total = straight * 2 + TAU * r;
  let d = ((((index % 100) + 100) % 100) / 100) * total;
  if (d < straight) return { x: -11 + d, z: 7.6, angle: 0 };
  d -= straight;
  if (d < Math.PI * r) {
    const a = Math.PI / 2 - d / r;
    return {
      x: 11 + r * Math.cos(a),
      z: r * Math.sin(a),
      angle: a - Math.PI / 2,
    };
  }
  d -= Math.PI * r;
  if (d < straight) return { x: 11 - d, z: -7.6, angle: Math.PI };
  d -= straight;
  const a = -Math.PI / 2 - d / r;
  return {
    x: -11 + r * Math.cos(a),
    z: r * Math.sin(a),
    angle: a - Math.PI / 2,
  };
}
function canvasTexture(draw, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function textTexture(text, color = "#fbf6e5", bg = null) {
  return canvasTexture((c, s) => {
    if (bg) {
      c.fillStyle = bg;
      c.fillRect(0, 0, s, s);
    }
    c.fillStyle = color;
    c.font = 'bold 54px "Segoe UI", "Microsoft YaHei", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, s / 2, s / 2);
  });
}
function mesh(geo, mat, parent, pos) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (pos) m.position.copy(pos);
  parent.add(m);
  return m;
}
const rounded = (x, y, z, r = 0.15) => new RoundedBoxGeometry(x, y, z, 2, r);

export class BoardScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#b9d0c1");
    this.scene.fog = new THREE.Fog("#b9d0c1", 90, 180);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(39, 1, 0.1, 200);
    this.target = v(0, 0, 0);
    this.viewTarget = v(0, 0, 0);
    this.distance = 48;
    this.wantDistance = 48;
    this.pan = v();
    this.tweens = [];
    this.pawns = [];
    this.effects = [];
    this.mode = "menu";
    this.time = 0;
    this.diceTween = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.tileMeshes = [];
    this.scene.add(new THREE.HemisphereLight("#fffcf4", "#688b79", 2.9));
    const sun = new THREE.DirectionalLight("#fff0cf", 3.8);
    sun.position.set(-15, 35, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -30,
      right: 30,
      top: 25,
      bottom: -25,
      near: 1,
      far: 85,
    });
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildBoard();
    this.buildDice();
    this.buildDecor();
    this.setPlayers(
      COLORS.map((color, i) => ({
        id: i,
        color,
        baton: 0,
        pos: i * 7,
        roster: [{ id: CHARACTERS[i].id }],
      })),
    );
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }
  buildBoard() {
    mesh(
      new THREE.PlaneGeometry(300, 300),
      material("#b9d0c1"),
      this.scene,
      v(0, -2, 0),
    ).rotation.x = -Math.PI / 2;
    mesh(
      rounded(44, 1.8, 25, 1.3),
      material("#33594e"),
      this.world,
      v(0, -0.7, 0),
    );
    mesh(
      rounded(43.8, 0.32, 24.8, 1.3),
      material("#eed6a5"),
      this.world,
      v(0, 0.16, 0),
    );
    mesh(
      rounded(42.8, 0.2, 23.8, 1.2),
      material("#adc39a"),
      this.world,
      v(0, 0.4, 0),
    );
    const tileColors = {
      normal: "#fff4d8",
      finish: "#f4c36b",
      advance: "#8ec9aa",
      retreat: "#edab95",
      obstacle: "#e6c77d",
      relay: "#b9a7d3",
      event: "#a0c9db",
    };
    for (const tile of TRACK) {
      const p = trackPoint(tile.index);
      const g = new THREE.Group();
      g.position.set(p.x, 0.62, p.z);
      g.rotation.y = -p.angle;
      this.world.add(g);
      const box = mesh(
        rounded(0.83, 0.22, 1.65, 0.09),
        material(tileColors[tile.type]),
        g,
        v(),
      );
      box.userData.tile = tile;
      this.tileMeshes.push(box);
      const tex = canvasTexture((c, s) => {
        c.fillStyle = "#425951";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = "600 47px sans-serif";
        c.fillText(String(tile.index).padStart(2, "0"), s / 2, 188);
        c.font = "bold 80px sans-serif";
        c.fillText(
          {
            advance: "+2",
            retreat: "−2",
            obstacle: "Ⅱ",
            relay: "⚑",
            event: tile.value > 0 ? "+1" : "−1",
            finish: "★",
          }[tile.type] || "·",
          s / 2,
          90,
        );
      });
      const label = mesh(
        new THREE.PlaneGeometry(0.72, 1.45),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
        }),
        g,
        v(0, 0.117, 0),
      );
      label.rotation.x = -Math.PI / 2;
      label.castShadow = false;
    }
    // Infield: an octagonal, felt-lined dice tray with a solid wood rim.
    this.tray = new THREE.Group();
    this.world.add(this.tray);
    mesh(
      new THREE.CylinderGeometry(5.55, 5.8, 0.36, 8),
      material("#ddba80"),
      this.tray,
      v(0, 0.7, 0),
    );
    mesh(
      new THREE.CylinderGeometry(5.13, 5.13, 0.08, 8),
      material("#3b6d60"),
      this.tray,
      v(0, 0.925, 0),
    );
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) * TAU) / 8;
      const m = mesh(
        rounded(4.22, 0.55, 0.23, 0.09),
        material("#f3d8a5"),
        this.tray,
        v(Math.sin(a) * 5.12, 1.08, Math.cos(a) * 5.12),
      );
      m.rotation.y = a;
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 2.32, 80),
      new THREE.MeshBasicMaterial({ color: "#6b9380", side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.975;
    this.tray.add(ring);
    const brand = mesh(
      new THREE.PlaneGeometry(5.4, 1.2),
      new THREE.MeshBasicMaterial({
        map: textTexture("DICE & DASH", "#dde3bd"),
        transparent: true,
        depthWrite: false,
      }),
      this.world,
      v(-0.3, 0.53, -6),
    );
    brand.rotation.x = -Math.PI / 2;
    brand.castShadow = false;
    for (const index of [24, 49, 74]) {
      const p = trackPoint(index);
      const g = new THREE.Group();
      g.position.set(p.x, 0.55, p.z);
      this.world.add(g);
      mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 2.4, 8),
        material("#f8eed7"),
        g,
        v(0, 1.2, -1.4),
      );
      mesh(
        rounded(0.72, 0.45, 0.055, 0.025),
        material("#bda5dc"),
        g,
        v(0.34, 2.12, -1.4),
      );
    }
    const start = trackPoint(0);
    for (let j = 0; j < 2; j++)
      mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 2.3, 10),
        material("#f5edd8"),
        this.world,
        v(start.x, 0.5 + 1.15, start.z + (j ? 1.2 : -1.2)),
      );
    const arch = mesh(
      rounded(0.35, 0.48, 2.8, 0.1),
      material("#f6e9c9"),
      this.world,
      v(start.x, 2.8, start.z),
    );
    arch.material.map = canvasTexture((c, s) => {
      c.fillStyle = "#f6e9c9";
      c.fillRect(0, 0, s, s);
      c.fillStyle = "#35594f";
      for (let x = 0; x < 8; x++)
        for (let y = 0; y < 8; y++)
          if ((x + y) % 2 === 0) c.fillRect(x * 32, y * 32, 32, 32);
    });
  }
  buildDecor() {
    const positions = [
      [-20, -9],
      [-17, -10],
      [-21, 2],
      [21, -5],
      [18, 10],
      [13, 10],
      [-18, 10],
      [20, 7],
      [-12, -10],
      [8, -10],
      [16, -10],
    ];
    positions.forEach(([x, z], i) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0.5, z);
      this.world.add(tree);
      mesh(
        new THREE.CylinderGeometry(0.14, 0.23, 1.1, 7),
        material("#be9463"),
        tree,
        v(0, 0.55, 0),
      );
      for (let j = 0; j < 3; j++)
        mesh(
          new THREE.IcosahedronGeometry(0.82 - j * 0.16, 1),
          material(i % 3 ? "#709b70" : "#d1af81"),
          tree,
          v(j === 1 ? 0.3 : -0.1, 1.3 + j * 0.36, 0),
        );
    });
    for (const [x, z, col] of [
      [-16, -2, "#efa48b"],
      [17, 2, "#b3a4d5"],
      [-14, 4, "#d9b967"],
    ]) {
      const g = new THREE.Group();
      g.position.set(x, 0.5, z);
      this.world.add(g);
      mesh(
        new THREE.CylinderGeometry(0.45, 0.55, 0.7, 8),
        material("#f2dfb6"),
        g,
        v(0, 0.35, 0),
      );
      for (let i = 0; i < 3; i++) {
        mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 2.5, 5),
          material("#eee9d9"),
          g,
          v((i - 1) * 0.34, 1.7, 0),
        );
        const b = mesh(
          new THREE.SphereGeometry(0.46, 16, 12),
          material(i === 1 ? "#f6d387" : col),
          g,
          v((i - 1) * 0.42, 2.9 + Math.abs(i - 1) * 0.3, 0),
        );
        b.scale.y = 1.18;
      }
    }
    for (let i = 0; i < 7; i++) {
      const x = -6 + i * 2;
      mesh(
        rounded(1.4, 0.35, 0.8, 0.1),
        material(i % 2 ? "#ecb399" : "#f1d496"),
        this.world,
        v(x, 0.66, -10.2),
      );
    }
    // Small flower clusters, kept outside the readable track.
    for (let i = 0; i < 35; i++) {
      const x = Math.sin(i * 12.12) * 20,
        z = Math.cos(i * 7.32) * 10.7;
      if (Math.abs(z) < 9.4) continue;
      mesh(
        new THREE.IcosahedronGeometry(0.12, 0),
        material(i % 2 ? "#fff2cb" : "#e9b19a"),
        this.world,
        v(x, 0.64, z),
      );
    }
  }
  buildDice() {
    this.die = new THREE.Group();
    this.die.position.set(0, 1.81, 0);
    this.tray.add(this.die);
    this.dieBody = mesh(
      new RoundedBoxGeometry(1.68, 1.68, 1.68, 5, 0.22),
      new THREE.MeshStandardMaterial({
        color: "#fff9e8",
        roughness: 0.24,
        metalness: 0,
      }),
      this.die,
    );
    const faceConfigs = [
      [1, v(0, 1, 0)],
      [6, v(0, -1, 0)],
      [3, v(-1, 0, 0)],
      [4, v(1, 0, 0)],
      [2, v(0, 0, 1)],
      [5, v(0, 0, -1)],
    ];
    const patterns = {
      1: [[0, 0]],
      2: [
        [-1, 1],
        [1, -1],
      ],
      3: [
        [-1, 1],
        [0, 0],
        [1, -1],
      ],
      4: [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ],
      5: [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [0, 0],
      ],
      6: [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ],
    };
    for (const [n, normal] of faceConfigs) {
      const face = new THREE.Group();
      face.position.copy(normal.clone().multiplyScalar(0.841));
      face.quaternion.setFromUnitVectors(v(0, 0, 1), normal);
      this.die.add(face);
      for (const [x, y] of patterns[n]) {
        const dot = mesh(
          new THREE.CircleGeometry(0.125, 24),
          new THREE.MeshStandardMaterial({
            color: n === 1 ? "#d47762" : "#274e45",
            roughness: 0.7,
          }),
          face,
          v(x * 0.4, y * 0.4, 0.002),
        );
        dot.castShadow = false;
      }
    }
    this.aura = mesh(
      new THREE.RingGeometry(1.15, 1.18, 64),
      new THREE.MeshBasicMaterial({
        color: "#f0d391",
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
      this.tray,
      v(0, 0.98, 0),
    );
    this.aura.rotation.x = -Math.PI / 2;
  }
  skin(color) {
    this.dieBody.material.color.set(color);
  }
  character(def, color, scale = 1) {
    const g = new THREE.Group();
    const body = material(def.color),
      cream = material("#fff0d3"),
      dark = material("#294c45");
    mesh(
      new THREE.CylinderGeometry(0.29, 0.39, 0.55, 12),
      body,
      g,
      v(0, 0.6, 0),
    );
    mesh(new THREE.SphereGeometry(0.36, 16, 14), cream, g, v(0, 1.13, 0));
    for (const x of [-0.135, 0.135]) {
      mesh(new THREE.SphereGeometry(0.037, 8, 8), dark, g, v(x, 1.16, 0.326));
      mesh(
        new THREE.SphereGeometry(0.061, 8, 8),
        material("#efa192"),
        g,
        v(x * 1.6, 1.04, 0.29),
      );
      mesh(rounded(0.2, 0.14, 0.3, 0.06), dark, g, v(x * 1.25, 0.14, 0.08));
      mesh(new THREE.SphereGeometry(0.13, 10, 8), body, g, v(x * 2.8, 0.7, 0));
    }
    const idx = CHARACTERS.findIndex((c) => c.id === def.id);
    if (idx % 5 === 0) {
      mesh(new THREE.ConeGeometry(0.35, 0.5, 6), body, g, v(0, 1.56, 0));
      mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        material("#f3ce77"),
        g,
        v(0, 1.82, 0),
      );
    } else if (idx % 5 === 1) {
      mesh(
        new THREE.SphereGeometry(0.38, 12, 8, 0, TAU, 0, Math.PI / 2),
        body,
        g,
        v(0, 1.25, 0),
      );
      for (const x of [-0.2, 0.2]) {
        const ear = mesh(
          new THREE.SphereGeometry(0.1, 8, 8),
          body,
          g,
          v(x, 1.66, 0),
        );
        ear.scale.y = 2.5;
      }
    } else if (idx % 5 === 2) {
      mesh(
        new THREE.TorusGeometry(0.31, 0.09, 6, 16),
        body,
        g,
        v(0, 1.39, 0),
      ).rotation.x = Math.PI / 2;
      mesh(
        new THREE.CylinderGeometry(0.22, 0.3, 0.27, 8),
        body,
        g,
        v(0, 1.5, 0),
      );
    } else if (idx % 5 === 3) {
      mesh(rounded(0.77, 0.16, 0.53, 0.08), body, g, v(0, 1.38, 0));
      mesh(new THREE.SphereGeometry(0.15, 10, 8), body, g, v(0, 1.54, -0.05));
    } else {
      for (const x of [-0.28, 0.28])
        mesh(new THREE.SphereGeometry(0.2, 10, 8), body, g, v(x, 1.4, -0.08));
    }
    mesh(
      new THREE.CylinderGeometry(0.51, 0.55, 0.12, 24),
      material(color),
      g,
      v(0, 0.05, 0),
    );
    const badge = mesh(
      new THREE.PlaneGeometry(0.32, 0.25),
      new THREE.MeshBasicMaterial({
        map: textTexture(def.glyph, "#314c43"),
        transparent: true,
      }),
      g,
      v(0, 0.62, 0.36),
    );
    badge.castShadow = false;
    g.scale.setScalar(scale);
    return g;
  }
  setPlayers(players) {
    for (const p of this.pawns) {
      this.world.remove(p.group);
      p.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    }
    this.pawns = [];
    for (const p of players) {
      const def = definition(active(p));
      const group = this.character(def, p.color, 1.15);
      this.world.add(group);
      this.pawns.push({
        group,
        id: p.id,
        pos: p.pos,
        baton: p.baton,
        char: active(p).id,
      });
      this.placePawn(p.id, p.pos, 0);
    }
  }
  syncPlayers(players) {
    if (
      players.length !== this.pawns.length ||
      players.some((p, i) => this.pawns[i].char !== active(p).id)
    ) {
      this.setPlayers(players);
      return;
    }
    for (const p of players) this.placePawn(p.id, p.pos, 0.2);
  }
  placePawn(id, pos, duration = 0.16) {
    const pawn = this.pawns.find((p) => p.id === id);
    if (!pawn) return;
    const tp = trackPoint(pos),
      offset = (id - (this.pawns.length - 1) / 2) * 0.28;
    const target = v(
      tp.x + Math.sin(tp.angle) * offset,
      0.78,
      tp.z + Math.cos(tp.angle) * offset,
    );
    if (!duration) pawn.group.position.copy(target);
    else
      this.tweens.push({
        obj: pawn.group,
        start: pawn.group.position.clone(),
        target,
        duration,
        at: this.time,
      });
    pawn.pos = pos;
    pawn.group.rotation.y = -tp.angle + Math.PI / 2;
  }
  quaternion(o) {
    const mat = new THREE.Matrix4().makeBasis(
      v(...o[4]),
      v(...o[1]),
      v(...o[2]),
    );
    return new THREE.Quaternion().setFromRotationMatrix(mat);
  }
  orient(o, duration = 0.5, dir = null, steps = 0, gesture = null) {
    const startPos = this.die.position.clone(),
      endPos = startPos.clone();
    if (dir) {
      const vector = {
        right: v(1, 0, 0),
        left: v(-1, 0, 0),
        up: v(0, 0, -1),
        down: v(0, 0, 1),
      }[dir];
      endPos.addScaledVector(vector, steps * 0.62);
    } else {
      endPos.x = THREE.MathUtils.clamp((gesture?.x ?? 110) * 0.012, -2.5, 2.5);
      endPos.z = THREE.MathUtils.clamp((gesture?.z ?? -80) * 0.012, -2.5, 2.5);
    }
    const radius = Math.hypot(endPos.x, endPos.z);
    if (radius > 3.4) {
      endPos.x *= 3.4 / radius;
      endPos.z *= 3.4 / radius;
    }
    endPos.y = 1.81;
    this.diceTween = {
      start: this.die.quaternion.clone(),
      end: this.quaternion(o),
      startPos,
      endPos,
      at: this.time,
      duration,
      dir,
      steps,
    };
  }
  wind(dir) {
    const d = {
      right: v(1, 0, 0),
      left: v(-1, 0, 0),
      up: v(0, 0, -1),
      down: v(0, 0, 1),
    }[dir];
    for (let i = 0; i < 16; i++) {
      const m = mesh(
        new THREE.SphereGeometry(0.04, 6, 4),
        new THREE.MeshBasicMaterial({ color: "#e9f9dc", transparent: true }),
        this.tray,
        v(
          -d.x * 4 + Math.random(),
          1.4 + Math.random(),
          -d.z * 4 + Math.random() * 2 - 1,
        ),
      );
      m.scale.set(Math.abs(d.x) * 14 + 1, 1, Math.abs(d.z) * 14 + 1);
      this.effects.push({
        mesh: m,
        at: this.time,
        life: 0.8,
        dir: d.clone().multiplyScalar(10),
        kind: "wind",
      });
    }
  }
  hammer() {
    this.shake = this.time;
    for (let i = 0; i < 3; i++) {
      const m = mesh(
        new THREE.RingGeometry(0.9, 1, 48),
        new THREE.MeshBasicMaterial({
          color: "#ffe3a1",
          transparent: true,
          side: THREE.DoubleSide,
        }),
        this.tray,
        v(0, 0.99 + i * 0.01, 0),
      );
      m.rotation.x = -Math.PI / 2;
      this.effects.push({
        mesh: m,
        at: this.time + i * 0.07,
        life: 0.7,
        kind: "ring",
      });
    }
  }
  focus(mode) {
    this.mode = mode;
    this.pan.set(0, 0, 0);
    this.viewTarget.set(mode === "menu" ? -10 : 0, 0, 0);
    this.wantDistance = mode === "dice" ? 21 : mode === "menu" ? 53 : 53;
  }
  zoom(delta) {
    this.wantDistance = THREE.MathUtils.clamp(
      this.wantDistance + delta,
      15,
      65,
    );
  }
  drag(dx, dy) {
    this.pan.x -= dx * 0.026;
    this.pan.z -= dy * 0.035;
    this.pan.clamp(v(-15, 0, -12), v(15, 0, 12));
  }
  pick(x, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(this.tileMeshes, false)[0]?.object
      .userData.tile;
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  frame(now) {
    const dt = this.paused ? 0 : Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    this.distance = THREE.MathUtils.damp(
      this.distance,
      this.wantDistance,
      4,
      dt,
    );
    this.target.lerp(
      this.viewTarget.clone().add(this.pan),
      1 - Math.exp(-4 * dt),
    );
    const aspectAdjust =
      this.camera.aspect < 1.5 ? 1.5 / this.camera.aspect : 1;
    this.camera.position
      .copy(this.target)
      .add(
        v(
          0,
          this.distance * 0.69 * aspectAdjust,
          this.distance * 0.72 * aspectAdjust,
        ),
      );
    this.camera.lookAt(this.target);
    if (this.diceTween) {
      const a = this.diceTween,
        t = THREE.MathUtils.clamp((this.time - a.at) / a.duration, 0, 1),
        e = ease(t);
      if (a.dir) {
        const axis = ["left", "right"].includes(a.dir)
          ? v(0, 0, a.dir === "right" ? -1 : 1)
          : v(a.dir === "up" ? -1 : 1, 0, 0);
        this.die.quaternion
          .copy(a.start)
          .premultiply(
            new THREE.Quaternion().setFromAxisAngle(
              axis,
              a.steps
                ? (Math.PI / 2) * a.steps * e
                : Math.sin(t * Math.PI * 2) * 0.15 * (1 - t),
            ),
          );
      } else {
        this.die.quaternion
          .slerpQuaternions(a.start, a.end, e)
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(
              v(0.7, 0.2, 1).normalize(),
              Math.PI * 6 * e,
            ),
          );
      }
      this.die.position.lerpVectors(a.startPos, a.endPos, e);
      this.die.position.y =
        1.81 +
        (a.dir
          ? Math.sin(t * Math.PI) * 0.65
          : Math.abs(Math.sin(t * Math.PI * 3)) * 2.2) *
          (1 - t * 0.7);
      if (t === 1) {
        this.die.quaternion.copy(a.end);
        this.die.position.y = 1.81;
        this.diceTween = null;
      }
    }
    this.aura.material.opacity = 0.3 + Math.sin(this.time * 2) * 0.12;
    this.aura.position.x = this.die.position.x;
    this.aura.position.z = this.die.position.z;
    this.tweens = this.tweens.filter((a) => {
      const t = Math.min(1, (this.time - a.at) / a.duration);
      a.obj.position.lerpVectors(a.start, a.target, ease(t));
      a.obj.position.y += Math.sin(t * Math.PI) * 0.35;
      return t < 1;
    });
    this.effects = this.effects.filter((a) => {
      const t = (this.time - a.at) / a.life;
      if (t > 1) {
        a.mesh.removeFromParent();
        a.mesh.geometry.dispose();
        a.mesh.material.dispose();
        return false;
      }
      a.mesh.material.opacity = Math.max(0, 1 - t);
      if (a.kind === "ring") a.mesh.scale.setScalar(1 + Math.max(0, t) * 4);
      else a.mesh.position.addScaledVector(a.dir, dt);
      return true;
    });
    this.world.rotation.z =
      this.shake && this.time - this.shake < 0.4
        ? Math.sin((this.time - this.shake) * 70) * 0.007
        : 0;
    this.renderer.render(this.scene, this.camera);
  }
}
