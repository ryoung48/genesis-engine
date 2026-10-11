import { InterleavedBuffer, InterleavedBufferAttribute } from "three"
import type {
	AttachContoursInput,
	ContourAttributesInput,
} from "@/ui/genesis/renderer/contours/types"

const CONTOUR_INTERVAL_KM = 0.5
const CONTOUR_OPACITY = 0.65
const CONTOUR_WIDTH_PX = 0.75
const FRAGMENT_DECLARATIONS = `
 varying vec3 vContourBarycentric;
 varying vec4 vContourControl0;
 varying vec3 vContourControl1;
 varying vec3 vContourControl2;
 uniform float uContoursVisible;
 vec3 applyContours(vec3 surfaceColor) {
  if (uContoursVisible < 0.5) return surfaceColor;
  vec3 b = vContourBarycentric;
  vec3 h = vContourControl0.xyz;
  vec3 e = vContourControl1;
  vec3 f = vContourControl2;
  float elevation = dot(h, b*b*b)
   + 3.0*(e.x*b.x*b.x*b.y + e.y*b.x*b.y*b.y + e.z*b.y*b.y*b.z
    + f.x*b.y*b.z*b.z + f.y*b.z*b.z*b.x + f.z*b.z*b.x*b.x)
   + 6.0*vContourControl0.w*b.x*b.y*b.z;
  float level = elevation / ${CONTOUR_INTERVAL_KM};
  float gradient = length(vec2(dFdx(level), dFdy(level)));
  float distanceToLine = abs(level - floor(level + 0.5));
  float width = max(gradient, 0.000001);
  float line = 1.0 - smoothstep(${CONTOUR_WIDTH_PX} * width, (${CONTOUR_WIDTH_PX} + 1.0) * width, distanceToLine);
  float land = step(0.5, level);
  float slope = smoothstep(0.0, 0.000001, gradient);
  return surfaceColor * (1.0 - line * land * slope * uContoursVisible * ${CONTOUR_OPACITY});
 }
`

function attach(input: AttachContoursInput) {
	const { material, visible, fragmentTarget, colorExpression } = input
	const visibility = { value: visible ? 1 : 0 }
	const beforeCompile = material.onBeforeCompile
	material.userData.contourVisibility = visibility
	material.onBeforeCompile = (shader, renderer) => {
		beforeCompile.call(material, shader, renderer)
		shader.uniforms.uContoursVisible = visibility
		shader.vertexShader = shader.vertexShader.replace(
			"void main() {",
			`
   attribute vec4 contourControl0;
   attribute vec3 contourControl1;
   attribute vec3 contourControl2;
   varying vec3 vContourBarycentric;
   varying vec4 vContourControl0;
   varying vec3 vContourControl1;
   varying vec3 vContourControl2;
   void main() {
    int corner = gl_VertexID % 3;
    vContourBarycentric = vec3(corner == 0 ? 1.0 : 0.0, corner == 1 ? 1.0 : 0.0, corner == 2 ? 1.0 : 0.0);
    vContourControl0 = contourControl0;
    vContourControl1 = contourControl1;
    vContourControl2 = contourControl2;
  `,
		)
		shader.fragmentShader = shader.fragmentShader.replace(
			"void main() {",
			`${FRAGMENT_DECLARATIONS}
void main() {`,
		)
		shader.fragmentShader = shader.fragmentShader.replace(
			fragmentTarget,
			`${colorExpression} = applyContours(${colorExpression});
${fragmentTarget}`,
		)
	}
	material.customProgramCacheKey = () => "elevation-contours-v2"
}

function addAttributes(input: ContourAttributesInput) {
	const buffer = new InterleavedBuffer(input.controls, 10)
	input.geometry.setAttribute(
		"contourControl0",
		new InterleavedBufferAttribute(buffer, 4, 0),
	)
	input.geometry.setAttribute(
		"contourControl1",
		new InterleavedBufferAttribute(buffer, 3, 4),
	)
	input.geometry.setAttribute(
		"contourControl2",
		new InterleavedBufferAttribute(buffer, 3, 7),
	)
}

export const CONTOURS = { attach, addAttributes }
