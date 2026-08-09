import assert from "node:assert/strict";
import test from "node:test";

import {
  BlockWebGLLayer,
  ORIGINAL_MOTE_LIGHT_RANGE,
  moteLightCenterFade,
  type WebGLLitMesh,
} from "../app/game/blockWebGL.ts";

test("reward-mote lights use the original center-distance falloff", () => {
  const rangeSquared = ORIGINAL_MOTE_LIGHT_RANGE ** 2;
  assert.equal(moteLightCenterFade([2, 3, -39.5], [2, 3, 2, 3]), 1);
  assert.ok(Math.abs(
    moteLightCenterFade([0, 0, -39.5], [2, 0, 2, 0])
      - (1 - 4 / rangeSquared),
  ) < 1e-12);
  assert.equal(moteLightCenterFade([0, 0, -39.5], [4, 0, 4, 0]), 0);
  assert.equal(moteLightCenterFade([2, 3, -39.5], [0, 0, 4, 6]), 1);
});

test("the WebGL block layer falls back on context loss and rebuilds on restore", () => {
  const listeners = new Map<string, EventListener>();
  const uniforms = new Map<string, number | number[]>();
  type MockUniformLocation = { name: string };
  let contextLost = false;
  let programCreations = 0;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    FLOAT: 6,
    STATIC_DRAW: 7,
    DEPTH_TEST: 8,
    LESS: 9,
    BLEND: 10,
    SRC_ALPHA: 11,
    ONE_MINUS_SRC_ALPHA: 12,
    CULL_FACE: 13,
    BACK: 14,
    COLOR_BUFFER_BIT: 16,
    DEPTH_BUFFER_BIT: 32,
    TRIANGLES: 15,
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: () => true,
    getShaderInfoLog: () => null,
    deleteShader: () => undefined,
    createProgram: () => {
      programCreations += 1;
      return {};
    },
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => true,
    getProgramInfoLog: () => null,
    deleteProgram: () => undefined,
    getAttribLocation: (_program: object, name: string) => name === "aPosition" ? 0 : 1,
    getUniformLocation: (_program: object, name: string) => ({ name }),
    useProgram: () => undefined,
    uniform1f: (location: MockUniformLocation, value: number) => {
      uniforms.set(location.name, value);
    },
    uniform2f: () => undefined,
    uniform3f: () => undefined,
    uniform3fv: (location: MockUniformLocation, values: Float32Array) => {
      uniforms.set(location.name, Array.from(values));
    },
    uniform4f: (
      location: MockUniformLocation,
      first: number,
      second: number,
      third: number,
      fourth: number,
    ) => {
      uniforms.set(location.name, [first, second, third, fourth]);
    },
    enableVertexAttribArray: () => undefined,
    enable: () => undefined,
    disable: () => undefined,
    depthFunc: () => undefined,
    blendFunc: () => undefined,
    cullFace: () => undefined,
    viewport: () => undefined,
    clearColor: () => undefined,
    clearDepth: () => undefined,
    clear: () => undefined,
    createBuffer: () => ({}),
    bindBuffer: () => undefined,
    bufferData: () => undefined,
    vertexAttribPointer: () => undefined,
    depthMask: () => undefined,
    drawArrays: () => undefined,
    isContextLost: () => contextLost,
  } as unknown as WebGLRenderingContext;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => {
      listeners.set(name, listener);
    },
  } as unknown as HTMLCanvasElement;
  const previousDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: () => canvas,
  };

  try {
    const layer = new BlockWebGLLayer(820, 820, 526, 534, 31, 42.5, [0, 4.2, -35]);
    const mesh: WebGLLitMesh = {
      faces: [{
        points: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1]],
      }],
    };
    assert.equal(layer.isAvailable(), true);
    assert.equal(layer.begin(mesh, [{
      position: [0, 0, -39.5],
      color: [0.4, 0.4, 0.4],
    }]), true);
    layer.draw({
      centerX: 526,
      centerY: 534,
      centerZ: 1,
      color: [1, 0, 0],
      alpha: 1,
      scale: 1,
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      spinAngle: 0,
    });
    assert.equal(uniforms.get("uMoteLightCount"), 1);
    assert.deepEqual(
      (uniforms.get("uMoteLightPositions[0]") as number[]).slice(0, 3),
      [0, 0, -39.5],
    );
    const uploadedColor = (
      uniforms.get("uMoteLightColors[0]") as number[]
    ).slice(0, 3);
    uploadedColor.forEach((channel) => assert.ok(Math.abs(channel - 0.4) < 1e-6));
    assert.deepEqual(uniforms.get("uLightBounds"), [0, 0, 0, 0]);
    assert.equal(uniforms.get("uMoteLightAttenuation"), 0);
    assert.equal(uniforms.get("uCenterZ"), 1);
    assert.equal(programCreations, 1);

    let prevented = false;
    contextLost = true;
    listeners.get("webglcontextlost")?.({
      preventDefault: () => {
        prevented = true;
      },
    } as unknown as Event);
    assert.equal(prevented, true);
    assert.equal(layer.isAvailable(), false);
    assert.equal(layer.begin(mesh), false);

    contextLost = false;
    listeners.get("webglcontextrestored")?.({} as Event);
    assert.equal(programCreations, 2, "shaders and uniforms are recreated");
    assert.equal(layer.isAvailable(), true);
    assert.equal(layer.begin(mesh), true, "mesh buffers are uploaded again after restore");
  } finally {
    if (previousDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = previousDocument;
    }
  }
});
