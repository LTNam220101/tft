import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { COST_COLOR, STAR_COLOR } from "./theme";
import type { GameEvent, Slot, Star } from "~/rollGame/engine";
import { BENCH_SIZE, BOARD_COLS, BOARD_ROWS } from "~/rollGame/engine";

/** `modelUrl`: animated .glb built by scripts/tft-models; the portrait token is shown until (or if never) it loads. */
export type SceneUnit = { id: number; star: Star; cost: number; iconUrl: string; modelUrl: string | null; slot: Slot };
export type PickResult = { kind: "unit"; unitId: number } | { kind: "slot"; slot: Slot } | null;
export type SceneCallbacks = {
    onPick: (hit: PickResult) => void;
    onHover?: (unitId: number | null) => void;
    onDragStart?: (unitId: number) => void;
    onDragMove?: (clientX: number, clientY: number) => void;
    /** `slot` is the board/bench slot under the dragged unit, or null when released off the arena slots. */
    onDrop: (unitId: number, slot: Slot | null, clientX: number, clientY: number) => void;
    /** Screen positions from `unitAnchors()` changed (resize, unit moved, model loaded). */
    onViewChange?: () => void;
};

/**
 * `arena`: both halves of the board plus the bench (roll mini-game).
 * `board`: the player's 4×7 board only, framed tightly (team builder).
 */
export type ArenaLayout = "arena" | "board";

/** Screen anchor (container px) above a unit's head, for HTML overlays such as item icons. */
export type UnitAnchor = { id: number; x: number; y: number; hidden: boolean };

/** Pointer travel (px) before a press on a unit turns into a drag instead of a click. */
const DRAG_THRESHOLD = 6;
/** Max ground distance from a slot centre for a dragged unit to snap onto it. */
const DROP_RADIUS = 1.15;

// ── Layout ───────────────────────────────────────────────────────────────────
const HEX_R = 1;
const COL_STEP = Math.sqrt(3) * HEX_R * 1.06;
const ROW_STEP = 1.5 * HEX_R * 1.06;
const BENCH_STEP = 1.95;
const TOTAL_ROWS = BOARD_ROWS * 2;
const SPRITE_W = 1.75;
const CANVAS_W = 256;
const CANVAS_H = 300;
/** League units -> world units (a hex is ~1.84 wide). One shared scale keeps relative sizes (Teemo small, Sett big);
 *  models whose idle pose is wider than a hex (monsters, wings, big weapons) are shrunk to fit their hex. */
const MODEL_UNIT_SCALE = 1 / 90;
const MODEL_MAX_HEIGHT = 2.5;
const MODEL_MAX_SPAN = 1.75;
/** Orbit limits: zoom range relative to the default framing, and how far the camera may tilt. */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const MIN_POLAR = 0.12;
const MAX_POLAR = 1.25;
/** In-game, higher star units are drawn bigger. */
const STAR_SCALE: Record<Star, number> = { 1: 1, 2: 1.12, 3: 1.26 };
const PLATE_W = 256;
const PLATE_H = 72;

/** Global rows 0..3 are the opponent half, 4..7 the player half (row 4 = front line). */
function hexPosition(globalRow: number, col: number): THREE.Vector3 {
    const shift = globalRow % 2 === 1 ? COL_STEP / 4 : -COL_STEP / 4;
    return new THREE.Vector3(
        (col - (BOARD_COLS - 1) / 2) * COL_STEP + shift,
        0,
        (globalRow - (TOTAL_ROWS - 1) / 2) * ROW_STEP,
    );
}

const BENCH_Z = hexPosition(TOTAL_ROWS - 1, 0).z + 2.4;

function slotPosition(slot: Slot): THREE.Vector3 {
    if (slot.area === "board") {
        return hexPosition(BOARD_ROWS + Math.floor(slot.index / BOARD_COLS), slot.index % BOARD_COLS);
    }
    return new THREE.Vector3((slot.index - (BENCH_SIZE - 1) / 2) * BENCH_STEP, 0, BENCH_Z);
}

// ── Canvas helpers ───────────────────────────────────────────────────────────
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
    let cached = imageCache.get(url);
    if (!cached) {
        cached = new Promise((resolve) => {
            if (!url) return resolve(null);
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
        imageCache.set(url, cached);
    }
    return cached;
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
}

function drawUnit(canvas: HTMLCanvasElement, img: HTMLImageElement | null, cost: number, star: Star) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cx = CANVAS_W / 2;
    const cy = 178;
    const r = 96;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (star === 3) {
        const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.3);
        glow.addColorStop(0, "rgba(255,213,74,0.9)");
        glow.addColorStop(1, "rgba(255,213,74,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 40, CANVAS_W, CANVAS_H - 40);
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#16202c";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    const shade = ctx.createLinearGradient(0, cy + r * 0.3, 0, cy + r);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = shade;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    ctx.lineWidth = 12;
    ctx.strokeStyle = COST_COLOR[cost] ?? COST_COLOR[1];
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10,14,20,0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
    ctx.stroke();

    const spacing = 48;
    const startX = cx - ((star - 1) * spacing) / 2;
    for (let i = 0; i < star; i++) {
        starPath(ctx, startX + i * spacing, 40, 24, 11);
        ctx.fillStyle = STAR_COLOR[star];
        ctx.shadowColor = star === 3 ? "rgba(255,200,40,0.9)" : "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(20,14,6,0.9)";
        ctx.stroke();
    }
}

/** Floating in-game style nameplate for 3D models: star pips over a health bar tinted by cost. */
function drawPlate(canvas: HTMLCanvasElement, cost: number, star: Star) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, PLATE_W, PLATE_H);
    const spacing = 30;
    const startX = PLATE_W / 2 - ((star - 1) * spacing) / 2;
    for (let i = 0; i < star; i++) {
        starPath(ctx, startX + i * spacing, 20, 15, 7);
        ctx.fillStyle = STAR_COLOR[star];
        ctx.shadowColor = star === 3 ? "rgba(255,200,40,0.9)" : "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(20,14,6,0.9)";
        ctx.stroke();
    }
    ctx.fillStyle = "rgba(8,12,18,0.9)";
    ctx.fillRect(48, 42, PLATE_W - 96, 20);
    ctx.fillStyle = "#3fd16b";
    ctx.fillRect(52, 46, PLATE_W - 104, 12);
    ctx.fillStyle = COST_COLOR[cost] ?? COST_COLOR[1];
    ctx.fillRect(52, 46, 14, 12);
}

type ModelAsset = { scene: THREE.Object3D; animations: Array<THREE.AnimationClip>; scale: number; offset: THREE.Vector3; height: number };

/** Size a model once from its idle pose (bind poses are T-poses with props parked at the origin). */
function measureModel(scene: THREE.Object3D, animations: Array<THREE.AnimationClip>): Omit<ModelAsset, "scene" | "animations"> {
    const idle = animations.find((c) => c.name === "idle");
    const mixer = new THREE.AnimationMixer(scene);
    if (idle) {
        mixer.clipAction(idle).play();
        mixer.update(0);
    }
    scene.updateMatrixWorld(true);
    // Skinned bounds go through the bone matrices, which are stale until each skeleton updates.
    scene.traverse((obj) => {
        if (obj instanceof THREE.SkinnedMesh) {
            obj.skeleton.update();
            obj.computeBoundingBox();
        }
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
    const scale = Math.min(
        MODEL_UNIT_SCALE,
        MODEL_MAX_HEIGHT / Math.max(size.y, 1e-3),
        MODEL_MAX_SPAN / Math.max(size.x, size.z, 1e-3),
    );
    // Feet on the ground, centred on the slot.
    const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    return { scale, offset, height: size.y * scale };
}

function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function grassTexture(): THREE.CanvasTexture {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size / 2);
    g.addColorStop(0, "#2f5a46");
    g.addColorStop(0.7, "#22443a");
    g.addColorStop(1, "#18302c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
        const light = Math.random() < 0.5;
        ctx.fillStyle = light ? "rgba(120,200,150,0.08)" : "rgba(0,0,0,0.09)";
        const s = 2 + Math.random() * 6;
        ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
    for (let i = 0; i < 70; i++) {
        ctx.fillStyle = ["rgba(255,170,220,0.35)", "rgba(190,255,200,0.3)", "rgba(255,240,170,0.3)"][i % 3];
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function disposeObject(root: THREE.Object3D) {
    root.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineLoop) {
            obj.geometry.dispose();
            const mats: Array<THREE.Material> = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
                (m as THREE.MeshStandardMaterial).map?.dispose();
                m.dispose();
            }
        }
    });
}

// ── Scene ────────────────────────────────────────────────────────────────────
type UnitView = {
    data: SceneUnit;
    group: THREE.Group;
    /** Holds the token or the model plus its nameplate; hover/star scaling applies here. */
    body: THREE.Group;
    sprite: THREE.Sprite;
    base: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
    ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    /** Invisible pick volume, so raycasts never touch skinned geometry. */
    hit: THREE.Mesh;
    canvas: HTMLCanvasElement;
    texture: THREE.CanvasTexture;
    plate: THREE.Sprite;
    plateCanvas: HTMLCanvasElement;
    plateTexture: THREE.CanvasTexture;
    model: THREE.Object3D | null;
    mixer: THREE.AnimationMixer | null;
    clips: Partial<Record<"idle" | "celebration", THREE.AnimationAction>>;
    target: THREE.Vector3;
    hover: number;
    /** Position is driven by a one-off animation instead of the slot lerp. */
    animated: boolean;
    disposed: boolean;
    phase: number;
};

type Tile = {
    mesh: THREE.Mesh<THREE.CylinderGeometry | THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    slot: Slot;
    baseEmissive: THREE.Color;
    baseIntensity: number;
};

/** Per-frame animation; return false when finished. */
type Anim = (dt: number) => boolean;

export class ArenaScene {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    private readonly cameraTarget = new THREE.Vector3();
    /** Camera offset from the target before the narrow-screen pull-back. */
    private readonly cameraOffset = new THREE.Vector3();
    /** Pull-back factor numerator: distance scales by fitWidth / aspect on narrow screens. */
    private readonly fitWidth: number;
    private readonly cameraBase = new THREE.Vector3();
    private highlighted: Tile | null = null;
    private readonly fog = new THREE.Fog("#0b1626", 30, 62);
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();
    private pointerInside = false;
    private readonly timer = new THREE.Timer();
    private readonly units = new Map<number, UnitView>();
    private readonly tiles: Array<Tile> = [];
    private readonly anims: Array<Anim> = [];
    private readonly disposables: Array<{ dispose: () => void }> = [];
    private readonly unitBaseGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.14, 40);
    private readonly ringGeo = new THREE.RingGeometry(0.78, 0.92, 48);
    private readonly sparkTexture = radialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)");
    private readonly hitGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.4, 12);
    private readonly hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    private readonly gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    /** One load per champion; units clone the cached skinned scene. */
    private readonly models = new Map<string, Promise<ModelAsset | null>>();
    private fireflies!: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    private fireflySeeds: Float32Array = new Float32Array();
    private hoveredUnit: number | null = null;
    private hoveredTile: Tile | null = null;
    private selected: number | null = null;
    /** Current left-button press; `unitId` is null when it started on empty space (camera orbit). */
    private press: { unitId: number | null; x: number; y: number } | null = null;
    private drag: { unitId: number; slot: Slot | null } | null = null;
    /** Dragged units are carried at portrait height so the pointer stays over the portrait. */
    private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
    private readonly dragPoint = new THREE.Vector3();
    private readonly controls: OrbitControls;
    /** The user rotated/zoomed: resizes keep their view instead of re-applying the default framing. */
    private userCamera = false;
    private readonly shakeOffset = new THREE.Vector3();
    private bottomInset = 0;
    private shake = 0;
    private raf = 0;
    private readonly resizeObserver: ResizeObserver;

    constructor(
        private readonly container: HTMLElement,
        private readonly callbacks: SceneCallbacks,
        private readonly layout: ArenaLayout = "arena",
    ) {
        if (layout === "arena") {
            this.cameraTarget.set(0, 0, 3.4);
            this.cameraOffset.set(0, 24, 16);
            this.fitWidth = 1.2;
        } else {
            // Centre of the player's four rows, slightly raised so unit heads stay in frame.
            this.cameraTarget.set(0, 1.3, (hexPosition(BOARD_ROWS, 0).z + hexPosition(TOTAL_ROWS - 1, 0).z) / 2 - 0.5);
            this.cameraOffset.set(0, 10, 7.6);
            this.fitWidth = 1.75;
        }
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.domElement.style.display = "block";
        this.renderer.domElement.style.touchAction = "none";
        container.appendChild(this.renderer.domElement);
        this.disposables.push(this.unitBaseGeo, this.ringGeo, this.sparkTexture, this.hitGeo, this.hitMaterial);

        this.buildEnvironment();
        this.buildBoard();

        // Registered before OrbitControls so a press on a unit can disable orbiting first.
        this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
        this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
        this.renderer.domElement.addEventListener("pointerup", this.handlePointerUp);
        this.renderer.domElement.addEventListener("pointercancel", this.handlePointerCancel);
        this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);

        // Drag empty space to rotate, wheel / pinch to zoom.
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enablePan = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.rotateSpeed = 0.6;
        this.controls.minPolarAngle = MIN_POLAR;
        this.controls.maxPolarAngle = MAX_POLAR;
        this.controls.addEventListener("start", this.handleControlsStart);
        this.controls.addEventListener("change", this.handleControlsChange);

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(container);
        this.resize();
        this.loop();
    }

    /** Back to the default framing after the user rotated or zoomed. */
    resetCamera() {
        this.userCamera = false;
        this.controls.target.copy(this.cameraTarget);
        this.camera.position.copy(this.cameraBase);
        this.controls.update();
        this.callbacks.onViewChange?.();
    }

    private readonly handleControlsStart = () => {
        this.userCamera = true;
    };

    private readonly handleControlsChange = () => {
        this.callbacks.onViewChange?.();
    };

    // ── Public API ───────────────────────────────────────────────────────────
    /** Pixels at the bottom covered by the HUD; the arena is re-centred above it. */
    setBottomInset(px: number) {
        this.bottomInset = px;
        this.resize();
    }

    /** Slot under a client point, counting a unit's body as its slot (HTML drag-and-drop onto the canvas). */
    slotAtClient(clientX: number, clientY: number): Slot | null {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const hit = this.pick();
        if (hit?.kind === "unit") return this.units.get(hit.unitId)?.data.slot ?? null;
        return hit?.slot ?? null;
    }

    /** Tint one slot while something is dragged over it; `null` clears. */
    setDropHighlight(slot: Slot | null, color: string | null) {
        if (this.highlighted) {
            this.highlighted.mesh.material.emissive.copy(this.highlighted.baseEmissive);
            this.highlighted.mesh.material.emissiveIntensity = this.highlighted.baseIntensity;
        }
        const tile = slot ? this.tiles.find((t) => t.slot.area === slot.area && t.slot.index === slot.index) : undefined;
        this.highlighted = tile && color ? tile : null;
        if (this.highlighted && color) {
            this.highlighted.mesh.material.emissive.set(color);
            this.highlighted.mesh.material.emissiveIntensity = 0.9;
        }
    }

    /** Where each unit's overlay should sit: above its nameplate at its resting slot. */
    unitAnchors(): Array<UnitAnchor> {
        const rect = this.renderer.domElement.getBoundingClientRect();
        // Called right after camera moves (controls, reset, resize), before the next render refreshes matrices.
        this.camera.updateMatrixWorld();
        const point = new THREE.Vector3();
        return [...this.units.values()].map((view) => {
            // Mirrors the frame loop's body transform at rest: star/selection scale and selection lift.
            const selected = view.data.id === this.selected;
            const scale = (view.model ? STAR_SCALE[view.data.star] : 1) * (selected ? 1.12 : 1);
            const plateTop = view.model ? view.plate.position.y + (view.plate.scale.y * 1.1) : 2.15;
            const top = (selected ? 0.35 : 0) + plateTop * scale;
            point.copy(view.target).setY(top).project(this.camera);
            return {
                id: view.data.id,
                x: ((point.x + 1) / 2) * rect.width,
                y: ((1 - point.y) / 2) * rect.height,
                // Dragged units carry no overlay; z > 1 means the point is behind the camera.
                hidden: view.data.id === this.drag?.unitId || point.z > 1,
            };
        });
    }

    setSelected(unitId: number | null) {
        this.selected = unitId;
        this.callbacks.onViewChange?.();
    }

    sync(units: Array<SceneUnit>, events: Array<GameEvent>) {
        const next = new Map(units.map((u) => [u.id, u]));
        const spawned = new Set<number>();
        for (const e of events) if (e.type === "spawn") spawned.add(e.unitId);

        for (const [id, view] of this.units) {
            if (next.has(id)) continue;
            this.units.delete(id);
            const combine = events.find((e) => e.type === "combine" && e.consumedIds.includes(id));
            const keeper = combine?.type === "combine" ? next.get(combine.keeperId) : undefined;
            if (keeper) this.animateConsume(view, slotPosition(keeper.slot));
            else if (events.some((e) => e.type === "sell" && e.unitId === id)) this.animateSell(view);
            else this.disposeUnit(view);
        }

        for (const u of units) {
            const view = this.units.get(u.id);
            if (!view) {
                const created = this.createUnit(u);
                if (spawned.has(u.id)) this.animateSpawn(created);
                continue;
            }
            if (view.data.star !== u.star) {
                view.data = u;
                this.redraw(view);
            }
            if (view.data.slot.area !== u.slot.area || view.data.slot.index !== u.slot.index) {
                view.target.copy(slotPosition(u.slot));
            }
            view.data = u;
        }

        for (const e of events) {
            if (e.type === "combine") {
                const keeper = next.get(e.keeperId);
                if (keeper) this.delay(0.32, () => this.combineBurst(slotPosition(keeper.slot), e.star));
            } else if (e.type === "targetDone" || e.type === "win") {
                const unit = next.get(e.unitId);
                if (!unit) continue;
                // A finished comp target celebrates; finishing the whole comp adds the big burst.
                this.delay(0.4, () => {
                    const view = this.units.get(unit.id);
                    if (view) this.celebrate(view);
                });
                if (e.type === "win") this.delay(0.55, () => this.winBurst(slotPosition(unit.slot)));
                else this.delay(0.45, () => this.ringWave(slotPosition(unit.slot), "#ffd54a", 0.9, 4));
            } else if (e.type === "levelUp") {
                this.pulseTiles();
            }
        }
        this.callbacks.onViewChange?.();
    }

    dispose() {
        cancelAnimationFrame(this.raf);
        this.resizeObserver.disconnect();
        this.controls.removeEventListener("start", this.handleControlsStart);
        this.controls.removeEventListener("change", this.handleControlsChange);
        this.controls.dispose();
        this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
        this.renderer.domElement.removeEventListener("pointermove", this.handlePointerMove);
        this.renderer.domElement.removeEventListener("pointerup", this.handlePointerUp);
        this.renderer.domElement.removeEventListener("pointercancel", this.handlePointerCancel);
        this.renderer.domElement.removeEventListener("pointerleave", this.handlePointerLeave);
        for (const view of this.units.values()) this.disposeUnit(view);
        this.units.clear();
        disposeObject(this.scene);
        // Cached model sources are not in the scene; their clones only shared geometry/materials with them.
        for (const asset of this.models.values()) void asset.then((a) => a && disposeObject(a.scene));
        for (const d of this.disposables) d.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }

    // ── Construction ─────────────────────────────────────────────────────────
    private buildEnvironment() {
        const scene = this.scene;
        scene.background = new THREE.Color("#0b1626");
        scene.fog = this.fog;

        scene.add(new THREE.HemisphereLight("#bfe0ff", "#1d3020", 1.1));
        const sun = new THREE.DirectionalLight("#fff0d8", 2.2);
        sun.position.set(9, 20, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera;
        sc.left = -16;
        sc.right = 16;
        sc.top = 16;
        sc.bottom = -16;
        sc.near = 1;
        sc.far = 50;
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const rim = new THREE.PointLight("#7fd6ff", 40, 30, 1.6);
        rim.position.set(-12, 6, -10);
        scene.add(rim);
        const warm = new THREE.PointLight("#ff9ad5", 30, 26, 1.6);
        warm.position.set(12, 5, -6);
        scene.add(warm);

        // Floating island
        const islandTex = grassTexture();
        const island = new THREE.Mesh(
            new THREE.CylinderGeometry(15.5, 13, 2.2, 72, 1),
            [
                new THREE.MeshStandardMaterial({ color: "#3a2e26", roughness: 1 }),
                new THREE.MeshStandardMaterial({ map: islandTex, roughness: 0.95 }),
                new THREE.MeshStandardMaterial({ color: "#241c18", roughness: 1 }),
            ],
        );
        island.position.y = -1.18;
        island.receiveShadow = true;
        scene.add(island);

        // Stone rim around the board
        const rimMesh = new THREE.Mesh(
            new THREE.TorusGeometry(15.3, 0.35, 10, 90),
            new THREE.MeshStandardMaterial({ color: "#4b5563", roughness: 0.9, flatShading: true }),
        );
        rimMesh.rotation.x = Math.PI / 2;
        rimMesh.position.y = -0.1;
        scene.add(rimMesh);

        // Deep water below
        const water = new THREE.Mesh(
            new THREE.CircleGeometry(80, 48),
            new THREE.MeshStandardMaterial({ color: "#0d2a3d", roughness: 0.35, metalness: 0.2 }),
        );
        water.rotation.x = -Math.PI / 2;
        water.position.y = -3.4;
        scene.add(water);

        this.buildFlora();
        this.buildFireflies();
    }

    private buildFlora() {
        const trunkMat = new THREE.MeshStandardMaterial({ color: "#5b3b2a", roughness: 1, flatShading: true });
        const canopyMats = ["#ff9ccf", "#5fd3a2", "#b48cff", "#ffd27a"].map(
            (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, emissive: c, emissiveIntensity: 0.08 }),
        );
        const rockMat = new THREE.MeshStandardMaterial({ color: "#5d6673", roughness: 1, flatShading: true });
        const glowMat = new THREE.MeshStandardMaterial({ color: "#9ffcff", emissive: "#5ff3ff", emissiveIntensity: 1.6 });
        const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1.8, 7);
        const canopyGeo = new THREE.IcosahedronGeometry(1.2, 0);
        const rockGeo = new THREE.DodecahedronGeometry(0.7, 0);
        const shroomGeo = new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const stemGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6);
        this.disposables.push(trunkMat, rockMat, glowMat, trunkGeo, canopyGeo, rockGeo, shroomGeo, stemGeo, ...canopyMats);

        let seed = 7;
        const rand = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        for (let i = 0; i < 26; i++) {
            const angle = (i / 26) * Math.PI * 2 + rand() * 0.15;
            // Keep the camera-facing arc clear so the bench stays visible.
            if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)) - Math.PI / 2) < 0.75) continue;
            const radius = 13.4 + rand() * 1.2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            if (i % 3 !== 2) {
                const tree = new THREE.Group();
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.y = 0.9;
                trunk.castShadow = true;
                tree.add(trunk);
                const mat = canopyMats[i % canopyMats.length];
                for (let k = 0; k < 3; k++) {
                    const blob = new THREE.Mesh(canopyGeo, mat);
                    blob.position.set((rand() - 0.5) * 0.9, 2.1 + k * 0.55, (rand() - 0.5) * 0.9);
                    blob.scale.setScalar(1 - k * 0.22);
                    blob.castShadow = true;
                    tree.add(blob);
                }
                tree.position.set(x, 0, z);
                tree.scale.setScalar(0.8 + rand() * 0.6);
                this.scene.add(tree);
            } else {
                const rock = new THREE.Mesh(rockGeo, rockMat);
                rock.position.set(x, 0.2, z);
                rock.rotation.set(rand(), rand(), rand());
                rock.scale.setScalar(0.8 + rand());
                rock.castShadow = true;
                this.scene.add(rock);
            }
            const shroom = new THREE.Group();
            const cap = new THREE.Mesh(shroomGeo, glowMat);
            cap.position.y = 0.3;
            const stem = new THREE.Mesh(stemGeo, trunkMat);
            stem.position.y = 0.15;
            shroom.add(cap, stem);
            shroom.position.set(Math.cos(angle + 0.12) * (radius - 1.4), 0, Math.sin(angle + 0.12) * (radius - 1.4));
            this.scene.add(shroom);
        }
    }

    private buildFireflies() {
        const count = 140;
        const positions = new Float32Array(count * 3);
        this.fireflySeeds = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 4 + Math.random() * 16;
            this.fireflySeeds.set([Math.cos(a) * r, 0.6 + Math.random() * 5, Math.sin(a) * r, Math.random() * 10], i * 4);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.fireflies = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                color: "#c8ffa8",
                size: 0.28,
                map: this.sparkTexture,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.scene.add(this.fireflies);
    }

    private buildBoard() {
        const hexGeo = new THREE.CylinderGeometry(HEX_R * 0.97, HEX_R * 0.97, 0.16, 6);
        const benchGeo = new THREE.BoxGeometry(1.72, 0.16, 1.72);
        this.disposables.push(hexGeo, benchGeo);
        const outline = (points: Array<THREE.Vector3>, color: string, opacity: number) =>
            new THREE.LineLoop(
                new THREE.BufferGeometry().setFromPoints(points),
                new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
            );
        const hexPoints = Array.from({ length: 6 }, (_, k) => {
            const a = (k * Math.PI) / 3;
            return new THREE.Vector3(Math.sin(a) * HEX_R * 0.97, 0.09, Math.cos(a) * HEX_R * 0.97);
        });

        // `board` layout: the player's half only.
        for (let row = this.layout === "arena" ? 0 : BOARD_ROWS; row < TOTAL_ROWS; row++) {
            const isPlayer = row >= BOARD_ROWS;
            for (let col = 0; col < BOARD_COLS; col++) {
                const mesh = new THREE.Mesh(
                    hexGeo,
                    new THREE.MeshStandardMaterial({
                        color: isPlayer ? "#2b4a63" : "#3b2a3d",
                        roughness: 0.55,
                        metalness: 0.15,
                        emissive: isPlayer ? "#3a8fd1" : "#8a3050",
                        emissiveIntensity: isPlayer ? 0.12 : 0.06,
                        transparent: true,
                        opacity: isPlayer ? 0.92 : 0.7,
                    }),
                );
                mesh.position.copy(hexPosition(row, col));
                mesh.receiveShadow = true;
                const line = outline(hexPoints, isPlayer ? "#8fd3ff" : "#ff8fb0", isPlayer ? 0.55 : 0.25);
                mesh.add(line);
                this.scene.add(mesh);
                if (isPlayer) {
                    this.tiles.push({
                        mesh,
                        slot: { area: "board", index: (row - BOARD_ROWS) * BOARD_COLS + col },
                        baseEmissive: mesh.material.emissive.clone(),
                        baseIntensity: mesh.material.emissiveIntensity,
                    });
                }
            }
        }

        if (this.layout !== "arena") return;
        const benchPoints = [
            new THREE.Vector3(-0.86, 0.09, -0.86),
            new THREE.Vector3(0.86, 0.09, -0.86),
            new THREE.Vector3(0.86, 0.09, 0.86),
            new THREE.Vector3(-0.86, 0.09, 0.86),
        ];
        for (let i = 0; i < BENCH_SIZE; i++) {
            const slot: Slot = { area: "bench", index: i };
            const mesh = new THREE.Mesh(
                benchGeo,
                new THREE.MeshStandardMaterial({
                    color: "#4a3b2a",
                    roughness: 0.8,
                    emissive: "#ffb347",
                    emissiveIntensity: 0.05,
                }),
            );
            mesh.position.copy(slotPosition(slot));
            mesh.receiveShadow = true;
            mesh.add(outline(benchPoints, "#e8c27a", 0.55));
            this.scene.add(mesh);
            this.tiles.push({ mesh, slot, baseEmissive: mesh.material.emissive.clone(), baseIntensity: mesh.material.emissiveIntensity });
        }
    }

    // ── Units ────────────────────────────────────────────────────────────────
    private createUnit(data: SceneUnit): UnitView {
        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
        sprite.center.set(0.5, 0);
        sprite.position.y = 0.12;
        sprite.scale.set(SPRITE_W, (SPRITE_W * CANVAS_H) / CANVAS_W, 1);

        const plateCanvas = document.createElement("canvas");
        plateCanvas.width = PLATE_W;
        plateCanvas.height = PLATE_H;
        const plateTexture = new THREE.CanvasTexture(plateCanvas);
        plateTexture.colorSpace = THREE.SRGBColorSpace;
        const plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: plateTexture, transparent: true, depthTest: false }));
        plate.center.set(0.5, 0);
        plate.scale.set(1.05, (1.05 * PLATE_H) / PLATE_W, 1);
        plate.renderOrder = 10;
        plate.visible = false;

        const body = new THREE.Group();
        body.add(sprite, plate);

        const hit = new THREE.Mesh(this.hitGeo, this.hitMaterial);
        hit.position.y = 1.2;
        hit.userData.unitId = data.id;

        const tint = new THREE.Color(COST_COLOR[data.cost] ?? COST_COLOR[1]);
        const base = new THREE.Mesh(
            this.unitBaseGeo,
            new THREE.MeshStandardMaterial({
                color: new THREE.Color("#141b26").lerp(tint, 0.45),
                metalness: 0.6,
                roughness: 0.3,
                emissive: tint,
                emissiveIntensity: 0.08,
            }),
        );
        base.position.y = 0.16;
        base.castShadow = true;
        const ring = new THREE.Mesh(
            this.ringGeo,
            new THREE.MeshBasicMaterial({ color: "#ffd54a", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.12;

        const group = new THREE.Group();
        group.add(base, ring, body, hit);
        const target = slotPosition(data.slot);
        group.position.copy(target);
        this.scene.add(group);

        const view: UnitView = {
            data, group, body, sprite, base, ring, hit, canvas, texture, plate, plateCanvas, plateTexture,
            model: null, mixer: null, clips: {}, target,
            hover: 1, animated: false, disposed: false, phase: Math.random() * Math.PI * 2,
        };
        this.units.set(data.id, view);
        this.redraw(view);
        this.attachModel(view);
        return view;
    }

    private loadModel(url: string): Promise<ModelAsset | null> {
        let asset = this.models.get(url);
        if (!asset) {
            asset = this.gltfLoader.loadAsync(url).then(
                (gltf) => ({ scene: gltf.scene, animations: gltf.animations, ...measureModel(gltf.scene, gltf.animations) }),
                () => null, // missing model: keep the portrait token
            );
            this.models.set(url, asset);
        }
        return asset;
    }

    /** Swap the portrait token for the champion's animated model once it is loaded. */
    private attachModel(view: UnitView) {
        if (!view.data.modelUrl) return;
        void this.loadModel(view.data.modelUrl).then((asset) => {
            if (!asset || view.disposed) return;
            const model = cloneSkinned(asset.scene);
            model.position.copy(asset.offset);
            model.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.castShadow = true;
                    // Bounds come from the bind pose; animated limbs would get culled.
                    obj.frustumCulled = false;
                }
            });
            const holder = new THREE.Group();
            holder.scale.setScalar(asset.scale);
            holder.add(model);
            view.body.add(holder);
            view.model = holder;
            view.sprite.visible = false;
            view.plate.visible = true;
            view.plate.position.y = asset.height + 0.2;

            const mixer = new THREE.AnimationMixer(model);
            for (const name of ["idle", "celebration"] as const) {
                const clip = asset.animations.find((c) => c.name === name);
                if (clip) view.clips[name] = mixer.clipAction(clip);
            }
            const { idle, celebration } = view.clips;
            if (idle) {
                idle.play();
                idle.time = Math.random() * idle.getClip().duration;
            }
            if (celebration) {
                celebration.setLoop(THREE.LoopOnce, 1);
                mixer.addEventListener("finished", (e) => {
                    if (e.action !== celebration) return;
                    celebration.fadeOut(0.3);
                    idle?.reset().fadeIn(0.3).play();
                });
            }
            view.mixer = mixer;
            this.callbacks.onViewChange?.();
        });
    }

    private celebrate(view: UnitView) {
        const { idle, celebration } = view.clips;
        if (!celebration) return;
        idle?.fadeOut(0.25);
        celebration.reset().fadeIn(0.25).play();
    }

    private redraw(view: UnitView) {
        const { iconUrl, cost, star } = view.data;
        drawUnit(view.canvas, null, cost, star);
        view.texture.needsUpdate = true;
        void loadImage(iconUrl).then((img) => {
            if (!img || view.data.star !== star) return;
            drawUnit(view.canvas, img, cost, star);
            view.texture.needsUpdate = true;
        });
        drawPlate(view.plateCanvas, cost, star);
        view.plateTexture.needsUpdate = true;
        view.base.material.emissiveIntensity = star === 3 ? 0.5 : 0.08;
    }

    private disposeUnit(view: UnitView) {
        view.disposed = true;
        this.scene.remove(view.group);
        if (view.mixer && view.model) {
            view.mixer.stopAllAction();
            view.mixer.uncacheRoot(view.model);
        }
        view.texture.dispose();
        view.sprite.material.dispose();
        view.plateTexture.dispose();
        view.plate.material.dispose();
        view.base.material.dispose();
        view.ring.material.dispose();
    }

    // ── Animations & effects ─────────────────────────────────────────────────
    private delay(seconds: number, fn: () => void) {
        let t = 0;
        this.anims.push((dt) => {
            t += dt;
            if (t < seconds) return true;
            fn();
            return false;
        });
    }

    private animateSpawn(view: UnitView) {
        view.animated = true;
        let t = 0;
        const duration = 0.45;
        this.anims.push((dt) => {
            t = Math.min(duration, t + dt);
            const k = t / duration;
            view.group.position.set(view.target.x, (1 - easeOutCubic(k)) * 3.5, view.target.z);
            view.group.scale.setScalar(Math.max(0.01, easeOutBack(k)));
            if (k < 1) return true;
            view.animated = false;
            this.ringWave(view.target, COST_COLOR[view.data.cost] ?? "#ffffff", 0.45, 2.2);
            return false;
        });
    }

    private animateConsume(view: UnitView, to: THREE.Vector3) {
        const from = view.group.position.clone();
        let t = 0;
        const duration = 0.32;
        this.anims.push((dt) => {
            t = Math.min(duration, t + dt);
            const k = easeOutCubic(t / duration);
            view.group.position.lerpVectors(from, to, k);
            view.group.position.y = Math.sin(k * Math.PI) * 1.6;
            view.group.scale.setScalar(1 - k * 0.7);
            if (t < duration) return true;
            this.disposeUnit(view);
            return false;
        });
    }

    private animateSell(view: UnitView) {
        let t = 0;
        const duration = 0.35;
        const origin = view.group.position.clone();
        this.burst(origin.clone().setY(1), "#ffd54a", 18, 3.5, 0.9);
        this.anims.push((dt) => {
            t = Math.min(duration, t + dt);
            const k = t / duration;
            view.group.position.y = origin.y + k * 1.2;
            view.group.scale.setScalar(Math.max(0.01, 1 - k));
            if (t < duration) return true;
            this.disposeUnit(view);
            return false;
        });
    }

    private ringWave(at: THREE.Vector3, color: string, duration: number, maxScale: number) {
        const mesh = new THREE.Mesh(
            this.ringGeo,
            new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(at.x, 0.15, at.z);
        this.scene.add(mesh);
        let t = 0;
        this.anims.push((dt) => {
            t += dt;
            const k = Math.min(1, t / duration);
            mesh.scale.setScalar(1 + k * maxScale);
            mesh.material.opacity = 1 - k;
            if (k < 1) return true;
            this.scene.remove(mesh);
            mesh.material.dispose();
            return false;
        });
    }

    private burst(at: THREE.Vector3, color: string, count: number, speed: number, life: number, size = 0.32) {
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions.set([at.x, at.y, at.z], i * 3);
            const a = Math.random() * Math.PI * 2;
            const up = 0.4 + Math.random();
            const s = speed * (0.4 + Math.random() * 0.8);
            velocities.set([Math.cos(a) * s * 0.6, up * s, Math.sin(a) * s * 0.6], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const points = new THREE.Points(
            geo,
            new THREE.PointsMaterial({
                color, size, map: this.sparkTexture, transparent: true,
                depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        );
        this.scene.add(points);
        let t = 0;
        this.anims.push((dt) => {
            t += dt;
            for (let i = 0; i < count; i++) {
                velocities[i * 3 + 1] -= 6 * dt;
                positions[i * 3] += velocities[i * 3] * dt;
                positions[i * 3 + 1] = Math.max(0.1, positions[i * 3 + 1] + velocities[i * 3 + 1] * dt);
                positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
            }
            geo.attributes.position.needsUpdate = true;
            points.material.opacity = Math.max(0, 1 - t / life);
            if (t < life) return true;
            this.scene.remove(points);
            geo.dispose();
            points.material.dispose();
            return false;
        });
    }

    private combineBurst(at: THREE.Vector3, star: Star) {
        const color = STAR_COLOR[star];
        this.ringWave(at, color, 0.6, 3);
        this.burst(at.clone().setY(1.2), color, star === 3 ? 90 : 40, star === 3 ? 7 : 5, 1.1);
    }

    private winBurst(at: THREE.Vector3) {
        this.shake = 0.5;
        this.ringWave(at, "#ffd54a", 1.2, 9);
        this.delay(0.15, () => this.ringWave(at, "#fff2b0", 1, 6));
        this.burst(at.clone().setY(1.5), "#ffd54a", 260, 11, 2.4, 0.4);
        this.burst(at.clone().setY(1.5), "#ffffff", 80, 8, 1.8, 0.25);

        const alpha = document.createElement("canvas");
        alpha.width = 4;
        alpha.height = 128;
        const ctx = alpha.getContext("2d")!;
        const g = ctx.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, "#000");
        g.addColorStop(0.6, "#888");
        g.addColorStop(1, "#fff");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 128);
        const alphaTex = new THREE.CanvasTexture(alpha);
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.75, 1, 16, 32, 1, true),
            new THREE.MeshBasicMaterial({
                color: "#ffcf40", alphaMap: alphaTex, transparent: true, opacity: 0,
                side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        );
        pillar.position.set(at.x, 8, at.z);
        this.scene.add(pillar);
        const light = new THREE.PointLight("#ffd27a", 0, 14, 1.5);
        light.position.set(at.x, 2.5, at.z);
        this.scene.add(light);
        let t = 0;
        const life = 3;
        this.anims.push((dt) => {
            t += dt;
            const k = Math.min(1, t / life);
            const intensity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
            pillar.material.opacity = intensity * 0.9;
            pillar.scale.set(1 + k * 0.6, 1, 1 + k * 0.6);
            pillar.rotation.y += dt * 2;
            light.intensity = intensity * 120;
            if (k < 1) return true;
            this.scene.remove(pillar, light);
            pillar.geometry.dispose();
            pillar.material.dispose();
            alphaTex.dispose();
            light.dispose();
            return false;
        });
    }

    private pulseTiles() {
        let t = 0;
        const boardTiles = this.tiles.filter((tile) => tile.slot.area === "board");
        this.anims.push((dt) => {
            t += dt;
            const k = Math.min(1, t / 0.9);
            for (const tile of boardTiles) tile.mesh.material.emissiveIntensity = 0.12 + (1 - k) * 0.9;
            return k < 1;
        });
    }

    // ── Input ────────────────────────────────────────────────────────────────
    private setPointer(e: PointerEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    }

    private readonly handlePointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        this.setPointer(e);
        const hit = this.pick();
        this.press = { unitId: hit?.kind === "unit" ? hit.unitId : null, x: e.clientX, y: e.clientY };
        // A press on a unit drags the unit; anywhere else orbits the camera.
        this.controls.enabled = this.press.unitId === null;
        // Capture so the drag keeps tracking while the pointer crosses the HTML HUD.
        this.renderer.domElement.setPointerCapture(e.pointerId);
    };

    private readonly handlePointerMove = (e: PointerEvent) => {
        this.setPointer(e);
        this.pointerInside = true;
        const press = this.press;
        const unitId = press?.unitId ?? null;
        if (press && unitId !== null && !this.drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD) {
            this.drag = { unitId, slot: null };
            this.renderer.domElement.style.cursor = "grabbing";
            this.callbacks.onDragStart?.(unitId);
        }
        if (this.drag) this.callbacks.onDragMove?.(e.clientX, e.clientY);
    };

    private readonly handlePointerUp = (e: PointerEvent) => {
        if (e.button !== 0) return;
        this.setPointer(e);
        const { drag, press } = this;
        // A press that travelled on empty space was a camera orbit, not a click.
        const orbited = !!press && press.unitId === null && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD;
        this.endDrag(e.pointerId);
        if (drag) this.callbacks.onDrop(drag.unitId, drag.slot, e.clientX, e.clientY);
        else if (!orbited) this.callbacks.onPick(this.pick());
    };

    private readonly handlePointerCancel = (e: PointerEvent) => {
        this.endDrag(e.pointerId);
    };

    private readonly handlePointerLeave = () => {
        this.pointerInside = false;
    };

    private endDrag(pointerId: number) {
        this.press = null;
        this.drag = null;
        this.controls.enabled = true;
        this.renderer.domElement.style.cursor = "default";
        if (this.renderer.domElement.hasPointerCapture(pointerId)) {
            this.renderer.domElement.releasePointerCapture(pointerId);
        }
    }

    private pick(): PickResult {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = [...this.units.values()].filter((v) => !v.animated).map((v) => v.hit);
        const unitHit = this.raycaster.intersectObjects(hits, false).at(0);
        if (unitHit) return { kind: "unit", unitId: unitHit.object.userData.unitId as number };
        const tileHit = this.raycaster.intersectObjects(this.tiles.map((t) => t.mesh), false).at(0);
        const tile = tileHit && this.tiles.find((t) => t.mesh === tileHit.object);
        return tile ? { kind: "slot", slot: tile.slot } : null;
    }

    private setHoveredTile(tile: Tile | null) {
        if (tile === this.hoveredTile) return;
        if (this.hoveredTile) this.hoveredTile.mesh.scale.setScalar(1);
        this.hoveredTile = tile;
        if (tile) tile.mesh.scale.set(1.04, 1.6, 1.04);
    }

    /** Carry the dragged unit under the pointer and snap the drop target to the nearest slot. */
    private updateDrag(drag: { unitId: number; slot: Slot | null }) {
        const view = this.units.get(drag.unitId);
        if (!view) {
            this.drag = null;
            this.press = null;
            return;
        }
        this.raycaster.setFromCamera(this.pointer, this.camera);
        if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) return;
        view.group.position.set(this.dragPoint.x, 0.6, this.dragPoint.z);
        let nearest: Tile | null = null;
        let best = DROP_RADIUS;
        for (const tile of this.tiles) {
            const d = Math.hypot(tile.mesh.position.x - this.dragPoint.x, tile.mesh.position.z - this.dragPoint.z);
            if (d < best) {
                best = d;
                nearest = tile;
            }
        }
        drag.slot = nearest?.slot ?? null;
        this.setHoveredTile(nearest);
    }

    private updateHover() {
        if (this.drag) {
            this.updateDrag(this.drag);
            return;
        }
        const hit = this.pointerInside ? this.pick() : null;
        const unitId = hit?.kind === "unit" ? hit.unitId : null;
        if (unitId !== this.hoveredUnit) {
            this.hoveredUnit = unitId;
            this.callbacks.onHover?.(unitId);
            this.renderer.domElement.style.cursor = unitId !== null ? "grab" : "default";
        }
        this.setHoveredTile(hit?.kind === "slot" ? this.tiles.find((t) => t.slot === hit.slot) ?? null : null);
    }

    // ── Frame loop ───────────────────────────────────────────────────────────
    private resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.renderer.setSize(w, h);
        const fullH = h + this.bottomInset;
        const aspect = w / fullH;
        // Pull the camera back on narrow screens so the board (and bench) still fit.
        const distance = Math.min(2.6, Math.max(1, this.fitWidth / aspect));
        this.cameraBase.copy(this.cameraOffset).multiplyScalar(distance).add(this.cameraTarget);
        const baseDistance = this.cameraBase.distanceTo(this.cameraTarget);
        this.controls.minDistance = baseDistance * ZOOM_MIN;
        this.controls.maxDistance = baseDistance * ZOOM_MAX;
        if (!this.userCamera) {
            this.controls.target.copy(this.cameraTarget);
            this.camera.position.copy(this.cameraBase);
            this.camera.lookAt(this.cameraTarget);
        }
        // Show the lower h px of a frustum extended by the HUD height: the look-at point lands mid-way above the HUD.
        this.camera.setViewOffset(w, fullH, 0, this.bottomInset, w, h);
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.callbacks.onViewChange?.();
    }

    private readonly loop = (now: number = performance.now()) => {
        this.raf = requestAnimationFrame(this.loop);
        this.timer.update(now);
        const dt = Math.min(0.05, this.timer.getDelta());
        const time = this.timer.getElapsed();

        for (let i = this.anims.length - 1; i >= 0; i--) {
            if (!this.anims[i](dt)) this.anims.splice(i, 1);
        }
        this.updateHover();

        const follow = 1 - Math.exp(-dt * 14);
        for (const view of this.units.values()) {
            const dragged = view.data.id === this.drag?.unitId;
            if (!view.animated && !dragged) {
                view.group.position.lerp(view.target, follow);
            }
            const selected = view.data.id === this.selected;
            const hover = dragged ? 1.2 : view.data.id === this.hoveredUnit || selected ? 1.12 : 1;
            view.hover += (hover - view.hover) * follow;
            // Models breathe through their idle clip; tokens bob instead.
            const bob = view.model ? 0 : Math.sin(time * 2.2 + view.phase) * 0.05;
            view.body.position.y = (selected ? 0.35 : 0) + bob;
            view.body.scale.setScalar(view.hover * (view.model ? STAR_SCALE[view.data.star] : 1));
            view.mixer?.update(dt);
            view.ring.material.opacity = selected ? 0.65 + Math.sin(time * 6) * 0.3 : view.data.star === 3 ? 0.55 : 0;
            view.ring.material.color.set(selected ? "#ffffff" : "#ffd54a");
        }

        const positions = this.fireflies.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < positions.length / 3; i++) {
            const [x, y, z, s] = this.fireflySeeds.subarray(i * 4, i * 4 + 4);
            positions[i * 3] = x + Math.sin(time * 0.4 + s) * 0.8;
            positions[i * 3 + 1] = y + Math.sin(time * 0.9 + s * 2) * 0.4;
            positions[i * 3 + 2] = z + Math.cos(time * 0.35 + s) * 0.8;
        }
        this.fireflies.geometry.attributes.position.needsUpdate = true;

        this.controls.update(dt);
        // Fog begins past the arena at any zoom so the board is never washed out.
        const camDistance = this.camera.position.distanceTo(this.controls.target);
        this.fog.near = camDistance + 6;
        this.fog.far = camDistance + 34;

        this.shakeOffset.set(0, 0, 0);
        if (this.shake > 0) {
            this.shake = Math.max(0, this.shake - dt);
            const s = this.shake * 0.35;
            this.shakeOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }
        this.camera.position.add(this.shakeOffset);
        this.renderer.render(this.scene, this.camera);
        this.camera.position.sub(this.shakeOffset);
    };
}
