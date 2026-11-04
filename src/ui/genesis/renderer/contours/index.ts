import type { AttachContoursInput } from "@/ui/genesis/renderer/contours/types"
import { TIDAL_RANGE_STOPS } from "@/ui/genesis/shared/colors"

const CONTOUR_INTERVAL_KM = 0.5
const CONTOUR_OPACITY = 0.65
const CONTOUR_WIDTH_PX = 0.75
const TIDAL_MAJOR_INTERVAL_M = 1
const TIDAL_MINOR_INTERVAL_M = 0.1
const TIDAL_MAJOR_OPACITY = 0.8
const TIDAL_MINOR_OPACITY = 0.35
const glslFloat = (value: number) => value.toFixed(4)
const glslColor = (rgb: readonly number[]) =>
	`vec3(${rgb.map(glslFloat).join(", ")})`
const TIDAL_PALETTE = TIDAL_RANGE_STOPS.slice(1)
	.map(
		([to, rgb], i) =>
			`  c = mix(c, ${glslColor(rgb)}, clamp((value - ${glslFloat(TIDAL_RANGE_STOPS[i][0])}) / ${glslFloat(to - TIDAL_RANGE_STOPS[i][0])}, 0.0, 1.0));`,
	)
	.join("\n")
const TIDAL_MAJOR_WIDTH_PX = 1
const TIDAL_MINOR_WIDTH_PX = 0.5
const FRAGMENT_DECLARATIONS = `
 varying vec3 vContourBarycentric;
 varying vec4 vContourControl0;
 varying vec3 vContourControl1;
 varying vec3 vContourControl2;
 varying float vContourMask;
 uniform float uContoursVisible;
 uniform float uContourField;
 float contourLine(float level, float widthPx) {
  float gradient = max(length(vec2(dFdx(level), dFdy(level))), 0.000001);
  float distanceToLine = abs(level - floor(level + 0.5));
  return 1.0 - smoothstep(widthPx * gradient, (widthPx + 1.0) * gradient, distanceToLine);
 }
 float contourSpacingFade(float level, float denseGradient, float clutteredGradient) {
  float gradient = length(vec2(dFdx(level), dFdy(level)));
  return 1.0 - smoothstep(denseGradient, clutteredGradient, gradient);
 }
 vec3 tidalPalette(float value) {
  vec3 c = ${glslColor(TIDAL_RANGE_STOPS[0][1])};
${TIDAL_PALETTE}
  return c;
 }
 vec3 applyContours(vec3 surfaceColor) {
  if (uContoursVisible < 0.5) return surfaceColor;
  vec3 b = vContourBarycentric;
  vec3 h = vContourControl0.xyz;
  vec3 e = vContourControl1;
  vec3 f = vContourControl2;
  float value = dot(h, b*b*b)
   + 3.0*(e.x*b.x*b.x*b.y + e.y*b.x*b.y*b.y + e.z*b.y*b.y*b.z
    + f.x*b.y*b.z*b.z + f.y*b.z*b.z*b.x + f.z*b.z*b.x*b.x)
   + 6.0*vContourControl0.w*b.x*b.y*b.z;
  if (uContourField > 0.5) {
   if (vContourMask < 0.5) return surfaceColor;
   vec3 luma = vec3(0.2126, 0.7152, 0.0722);
   float lighting = clamp(dot(surfaceColor, luma) / max(dot(vColor.rgb, luma), 0.001), 0.0, 1.5);
   vec3 fill = tidalPalette(value) * lighting;
   if (value < ${TIDAL_MINOR_INTERVAL_M * 0.5}) return fill;
   float major = value / ${TIDAL_MAJOR_INTERVAL_M.toFixed(1)};
   float minor = value / ${TIDAL_MINOR_INTERVAL_M};
   float majorLine = contourLine(major, ${TIDAL_MAJOR_WIDTH_PX.toFixed(1)}) * contourSpacingFade(major, 0.2, 0.35);
   float minorLine = contourLine(minor, ${TIDAL_MINOR_WIDTH_PX}) * contourSpacingFade(minor, 0.1, 0.17);
   float shade = max(majorLine * ${TIDAL_MAJOR_OPACITY}, minorLine * ${TIDAL_MINOR_OPACITY});
   vec3 lineColor = min(fill * 1.7 + vec3(0.04, 0.1, 0.18) * lighting, vec3(1.0));
   return mix(fill, lineColor, shade);
  }
  float level = value / ${CONTOUR_INTERVAL_KM};
  float gradient = length(vec2(dFdx(level), dFdy(level)));
  float line = contourLine(level, ${CONTOUR_WIDTH_PX});
  float land = step(0.5, level);
  float slope = smoothstep(0.0, 0.000001, gradient);
  return surfaceColor * (1.0 - line * land * slope * ${CONTOUR_OPACITY});
 }
`

function attach(input: AttachContoursInput) {
	const { material, visible, fragmentTarget, colorExpression } = input
	const visibility = { value: visible ? 1 : 0 }
	const field = { value: 0 }
	const beforeCompile = material.onBeforeCompile
	material.userData.contourVisibility = visibility
	material.userData.contourField = field
	material.onBeforeCompile = (shader, renderer) => {
		beforeCompile.call(material, shader, renderer)
		if (!material.userData.contourReady) return
		shader.uniforms.uContoursVisible = visibility
		shader.uniforms.uContourField = field
		shader.vertexShader = shader.vertexShader.replace(
			"void main() {",
			`
   attribute vec4 contourControl0;
   attribute vec3 contourControl1;
   attribute vec3 contourControl2;
   attribute float contourMask;
   varying vec3 vContourBarycentric;
   varying vec4 vContourControl0;
   varying vec3 vContourControl1;
   varying vec3 vContourControl2;
   varying float vContourMask;
   void main() {
    int corner = gl_VertexID % 3;
    vContourBarycentric = vec3(corner == 0 ? 1.0 : 0.0, corner == 1 ? 1.0 : 0.0, corner == 2 ? 1.0 : 0.0);
    vContourControl0 = contourControl0;
    vContourControl1 = contourControl1;
    vContourControl2 = contourControl2;
    vContourMask = contourMask;
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
	material.customProgramCacheKey = () =>
		material.userData.contourReady ? "contours-v3" : "without-contours"
}
export const CONTOURS = { attach }
