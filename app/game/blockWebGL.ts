/*
 * GPU block layer for the browser port.
 *
 * Crack Attack's original OpenGL renderer places every block in one world,
 * then views and lights that world from fixed points. This layer preserves
 * that relationship while compositing into the existing Canvas2D scene.
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

type Vector3 = [number, number, number];

interface IndexedLitMesh {
  vertices: Vector3[];
  normals: Vector3[];
  faces: Array<{
    vertices: [number, number, number];
    normals: [number, number, number];
  }>;
}

interface PolygonLitMesh {
  faces: Array<{
    points: Vector3[];
    normals: Vector3[];
  }>;
}

export type WebGLLitMesh = IndexedLitMesh | PolygonLitMesh;

export interface WebGLBlockDraw {
  centerX: number;
  centerY: number;
  color: Vector3;
  alpha: number;
  scale: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  spinAxis?: Vector3;
  spinAngle: number;
  materialLight?: number;
  clipMinY?: number;
  doubleSided?: boolean;
}

const VERTEX_SHADER = `
  attribute vec3 aPosition;
  attribute vec3 aNormal;

  uniform vec2 uViewport;
  uniform vec2 uCenter;
  uniform vec2 uProjectionCenter;
  uniform vec3 uRotation;
  uniform vec3 uSpinAxis;
  uniform float uSpinAngle;
  uniform float uScale;
  uniform float uPixelsPerUnit;
  uniform float uCameraDistance;
  uniform vec3 uLightPosition;
  uniform vec3 uColor;
  uniform float uMaterialLight;

  varying vec3 vLitColor;
  varying vec3 vBackLitColor;
  varying float vObjectY;

  vec3 rotateX(vec3 value, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return vec3(
      value.x,
      value.y * cosine - value.z * sine,
      value.y * sine + value.z * cosine
    );
  }

  vec3 rotateY(vec3 value, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return vec3(
      value.x * cosine + value.z * sine,
      value.y,
      -value.x * sine + value.z * cosine
    );
  }

  vec3 rotateZ(vec3 value, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return vec3(
      value.x * cosine - value.y * sine,
      value.x * sine + value.y * cosine,
      value.z
    );
  }

  vec3 rotateEuler(vec3 value, vec3 angles) {
    return rotateZ(rotateY(rotateX(value, angles.x), angles.y), angles.z);
  }

  vec3 rotateAxis(vec3 value, vec3 axis, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return value * cosine
      + cross(axis, value) * sine
      + axis * dot(axis, value) * (1.0 - cosine);
  }

  void main() {
    vec3 spunPosition = rotateAxis(aPosition, uSpinAxis, uSpinAngle);
    vec3 spunNormal = rotateAxis(aNormal, uSpinAxis, uSpinAngle);
    vec3 objectPosition = rotateEuler(spunPosition, uRotation) * uScale;
    vec3 objectNormal = normalize(rotateEuler(spunNormal, uRotation));
    vec2 worldCenter = vec2(
      (uCenter.x - uProjectionCenter.x) / uPixelsPerUnit,
      (uProjectionCenter.y - uCenter.y) / uPixelsPerUnit
    );
    vec3 worldPosition = objectPosition
      + vec3(worldCenter, -uCameraDistance);

    float perspective = uCameraDistance / max(1.0, -worldPosition.z);
    vec2 pixel = uProjectionCenter
      + vec2(worldPosition.x, -worldPosition.y) * uPixelsPerUnit * perspective;
    vec2 clip = vec2(
      pixel.x / uViewport.x * 2.0 - 1.0,
      1.0 - pixel.y / uViewport.y * 2.0
    );

    gl_Position = vec4(clip, 0.5 - objectPosition.z * 0.012, 1.0);
    vObjectY = objectPosition.y;

    // Match the original fixed-function OpenGL path: lighting is evaluated at
    // vertices and the resulting color is interpolated across each triangle.
    // The default OpenGL local-viewer setting treats the eye as infinitely far
    // along +Z rather than recomputing a view ray for every fragment.
    vec3 lightDirection = normalize(uLightPosition - worldPosition);
    vec3 halfDirection = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
    float diffuse = max(dot(objectNormal, lightDirection), 0.0);
    float specular = diffuse > 0.0
      ? 0.5 * pow(max(dot(objectNormal, halfDirection), 0.0), 10.0)
      : 0.0;
    float backDiffuse = max(dot(-objectNormal, lightDirection), 0.0);
    float backSpecular = backDiffuse > 0.0
      ? 0.5 * pow(max(dot(-objectNormal, halfDirection), 0.0), 10.0)
      : 0.0;
    vLitColor = clamp(
      (uColor * diffuse + vec3(specular)) * uMaterialLight,
      0.0,
      1.0
    );
    vBackLitColor = clamp(
      (uColor * backDiffuse + vec3(backSpecular)) * uMaterialLight,
      0.0,
      1.0
    );
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;

  uniform float uAlpha;
  uniform float uClipEnabled;
  uniform float uClipMinY;
  uniform float uDoubleSided;
  varying vec3 vLitColor;
  varying vec3 vBackLitColor;
  varying float vObjectY;

  void main() {
    if (uClipEnabled > 0.5 && vObjectY < uClipMinY) discard;
    vec3 color = uDoubleSided > 0.5 && !gl_FrontFacing
      ? vBackLitColor
      : vLitColor;
    gl_FragColor = vec4(color, uAlpha);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL could not create a program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown program error";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function requiredUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`Missing WebGL uniform: ${name}`);
  return location;
}

export class BlockWebGLLayer {
  readonly canvas: HTMLCanvasElement;

  private readonly gl: WebGLRenderingContext;
  private readonly projectionCenterX: number;
  private readonly projectionCenterY: number;
  private readonly pixelsPerUnit: number;
  private readonly cameraDistance: number;
  private readonly lightPosition: Vector3;
  private program: WebGLProgram | null = null;
  private positionAttribute = -1;
  private normalAttribute = -1;
  private uniforms: Record<string, WebGLUniformLocation> = {};
  private meshBuffers = new WeakMap<object, {
    buffer: WebGLBuffer;
    vertexCount: number;
  }>();
  private mesh: WebGLLitMesh | null = null;
  private vertexCount = 0;
  private available = false;

  private readonly handleContextLost = (event: Event): void => {
    // Calling preventDefault opts in to the browser's context-restoration path.
    event.preventDefault();
    this.available = false;
    this.program = null;
    this.positionAttribute = -1;
    this.normalAttribute = -1;
    this.uniforms = {};
    this.meshBuffers = new WeakMap();
    this.mesh = null;
    this.vertexCount = 0;
  };

  private readonly handleContextRestored = (): void => {
    try {
      this.initializeResources();
    } catch {
      // Canvas2D remains a complete fallback if a restored context cannot
      // recreate its shaders or buffers on a resource-constrained device.
      this.available = false;
    }
  };

  constructor(
    width: number,
    height: number,
    projectionCenterX: number,
    projectionCenterY: number,
    pixelsPerUnit: number,
    cameraDistance: number,
    lightPosition: Vector3,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error("WebGL is unavailable.");
    this.gl = gl;
    this.projectionCenterX = projectionCenterX;
    this.projectionCenterY = projectionCenterY;
    this.pixelsPerUnit = pixelsPerUnit;
    this.cameraDistance = cameraDistance;
    this.lightPosition = lightPosition;
    this.initializeResources();
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
  }

  isAvailable(): boolean {
    return this.available && !this.gl.isContextLost();
  }

  begin(mesh: WebGLLitMesh): boolean {
    if (!this.isAvailable() || !this.program) return false;
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    this.useMesh(mesh);
    return this.isAvailable();
  }

  useMesh(mesh: WebGLLitMesh): void {
    if (!this.isAvailable()) throw new Error("WebGL context is unavailable.");
    if (this.mesh === mesh) return;
    const uploaded = this.meshBuffers.get(mesh as object) ?? this.uploadMesh(mesh);
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, uploaded.buffer);
    gl.vertexAttribPointer(this.positionAttribute, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(this.normalAttribute, 3, gl.FLOAT, false, 24, 12);
    this.mesh = mesh;
    this.vertexCount = uploaded.vertexCount;
  }

  draw(block: WebGLBlockDraw): void {
    if (!this.isAvailable()) throw new Error("WebGL context is unavailable.");
    const { gl, uniforms } = this;
    const spinAxis = block.spinAxis ?? [1, 0, 0];
    gl.uniform2f(uniforms.uCenter, block.centerX, block.centerY);
    gl.uniform3f(uniforms.uRotation, block.rotateX, block.rotateY, block.rotateZ);
    gl.uniform3f(uniforms.uSpinAxis, spinAxis[0], spinAxis[1], spinAxis[2]);
    gl.uniform1f(uniforms.uSpinAngle, block.spinAngle);
    gl.uniform1f(uniforms.uScale, block.scale);
    gl.uniform3f(uniforms.uColor, block.color[0], block.color[1], block.color[2]);
    gl.uniform1f(uniforms.uMaterialLight, block.materialLight ?? 1);
    gl.uniform1f(uniforms.uAlpha, block.alpha);
    gl.uniform1f(uniforms.uClipEnabled, block.clipMinY === undefined ? 0 : 1);
    gl.uniform1f(uniforms.uClipMinY, block.clipMinY ?? 0);
    gl.uniform1f(uniforms.uDoubleSided, block.doubleSided ? 1 : 0);
    if (block.doubleSided) gl.disable(gl.CULL_FACE);
    else gl.enable(gl.CULL_FACE);
    gl.depthMask(block.alpha >= 0.99);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.depthMask(true);
  }

  private initializeResources(): void {
    const { gl } = this;
    const program = createProgram(gl);
    const positionAttribute = gl.getAttribLocation(program, "aPosition");
    const normalAttribute = gl.getAttribLocation(program, "aNormal");
    if (positionAttribute < 0 || normalAttribute < 0) {
      gl.deleteProgram(program);
      throw new Error("WebGL block attributes are unavailable.");
    }
    const uniforms = Object.fromEntries([
      "uViewport",
      "uCenter",
      "uProjectionCenter",
      "uRotation",
      "uSpinAxis",
      "uSpinAngle",
      "uScale",
      "uPixelsPerUnit",
      "uCameraDistance",
      "uLightPosition",
      "uColor",
      "uMaterialLight",
      "uAlpha",
      "uClipEnabled",
      "uClipMinY",
      "uDoubleSided",
    ].map((name) => [name, requiredUniform(gl, program, name)]));

    this.program = program;
    this.positionAttribute = positionAttribute;
    this.normalAttribute = normalAttribute;
    this.uniforms = uniforms;
    this.meshBuffers = new WeakMap();
    this.mesh = null;
    this.vertexCount = 0;

    gl.useProgram(program);
    gl.uniform2f(uniforms.uViewport, this.canvas.width, this.canvas.height);
    gl.uniform2f(uniforms.uProjectionCenter, this.projectionCenterX, this.projectionCenterY);
    gl.uniform1f(uniforms.uPixelsPerUnit, this.pixelsPerUnit);
    gl.uniform1f(uniforms.uCameraDistance, this.cameraDistance);
    gl.uniform3f(
      uniforms.uLightPosition,
      this.lightPosition[0],
      this.lightPosition[1],
      this.lightPosition[2],
    );
    gl.enableVertexAttribArray(positionAttribute);
    gl.enableVertexAttribArray(normalAttribute);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.available = true;
  }

  private uploadMesh(mesh: WebGLLitMesh): { buffer: WebGLBuffer; vertexCount: number } {
    const data: number[] = [];
    if ("vertices" in mesh) {
      for (const face of mesh.faces) {
        for (let index = 0; index < 3; index += 1) {
          const vertex = mesh.vertices[face.vertices[index]];
          const normal = mesh.normals[face.normals[index]];
          data.push(...vertex, ...normal);
        }
      }
    } else {
      for (const face of mesh.faces) {
        for (let triangle = 1; triangle < face.points.length - 1; triangle += 1) {
          for (const index of [0, triangle, triangle + 1]) {
            data.push(...face.points[index], ...face.normals[index]);
          }
        }
      }
    }
    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error("WebGL could not create a mesh buffer.");
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
    const uploaded = { buffer, vertexCount: data.length / 6 };
    this.meshBuffers.set(mesh as object, uploaded);
    return uploaded;
  }
}
