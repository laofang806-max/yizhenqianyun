import type { EmbroideryColor } from "../types/embroidery";
import type { StandardizedEmbroidery } from "../types/exportData";

const COLOR_LABEL: Record<EmbroideryColor, string> = {
  black: "黑色",
  red: "红色",
  blue: "蓝色",
  yellow: "黄色",
};
const FPGA_ACTION_LIMIT = 4096;
const FPGA_DELTA_MIN = -32768;
const FPGA_DELTA_MAX = 32767;
const FPGA_FRAME_LIMIT_MM = 300;

export function buildColorText(
  data: StandardizedEmbroidery,
  color: EmbroideryColor,
  stepsPerMm: number,
): string {
  if (!Number.isFinite(stepsPerMm) || stepsPerMm <= 0) {
    throw new Error("电机标定值必须是大于 0 的有效 step/mm 数值。");
  }
  if (
    !Number.isFinite(data.frame.width) ||
    !Number.isFinite(data.frame.height) ||
    data.frame.width <= 0 ||
    data.frame.height <= 0 ||
    data.frame.width > FPGA_FRAME_LIMIT_MM ||
    data.frame.height > FPGA_FRAME_LIMIT_MM
  ) {
    throw new Error(`无回零模式下画框宽高必须在 0 到 ${FPGA_FRAME_LIMIT_MM} mm 以内。`);
  }

  const segments = data.paths[color].segments;
  let currentX = Math.round((data.frame.width / 2) * stepsPerMm);
  let currentY = Math.round((data.frame.height / 2) * stepsPerMm);
  const actions: string[] = [];
  for (const segment of segments) {
    for (const point of segment.points) {
      if (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x > data.frame.width ||
        point.y > data.frame.height
      ) {
        throw new Error(`${COLOR_LABEL[color]}路径包含无效或超出画框的坐标。`);
      }
      const nextX = Math.round(point.x * stepsPerMm);
      const nextY = Math.round(point.y * stepsPerMm);
      const dx = nextX - currentX;
      const dy = nextY - currentY;
      if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy)) {
        throw new Error(`${COLOR_LABEL[color]}路径步数超出安全整数范围。`);
      }
      const isJump = point.action === "jump";
      if (!isJump && point.action !== "stitch") {
        throw new Error(`${COLOR_LABEL[color]}路径包含未定义的动作类型。`);
      }
      // Long manually edited edges keep exactly one needle drop at the
      // selected endpoint: intermediate transport pieces are needle-up J moves.
      const pieceCount=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/FPGA_DELTA_MAX));
      const originX = currentX;
      const originY = currentY;
      for (let piece = 1; piece <= pieceCount; piece += 1) {
        const targetX =
          piece === pieceCount
            ? nextX
            : originX + Math.round((dx * piece) / pieceCount);
        const targetY =
          piece === pieceCount
            ? nextY
            : originY + Math.round((dy * piece) / pieceCount);
        const pieceDx = targetX - currentX;
        const pieceDy = targetY - currentY;
        if (
          pieceDx < FPGA_DELTA_MIN ||
          pieceDx > FPGA_DELTA_MAX ||
          pieceDy < FPGA_DELTA_MIN ||
          pieceDy > FPGA_DELTA_MAX
        ) {
          throw new Error(
            `${COLOR_LABEL[color]}路径中出现超出 int16 的单步位移(${pieceDx}, ${pieceDy})。`,
          );
        }
        if (actions.length >= FPGA_ACTION_LIMIT) {
          throw new Error(
            `${COLOR_LABEL[color]}需要超过 FPGA 的 ${FPGA_ACTION_LIMIT} 条动作缓存上限。`,
          );
        }
        actions.push(`${isJump || piece<pieceCount ? "J" : "S"},${pieceDx},${pieceDy}`);
        currentX = targetX;
        currentY = targetY;
      }
    }
  }
  return [`COLOR ${data.metadata.thread ? "layer" : color} ${actions.length}`, ...actions, ""].join("\n");
}

export function getNextDeviceColor(
  completedColors: readonly EmbroideryColor[],
  executionOrder: readonly EmbroideryColor[],
): EmbroideryColor | null {
  return executionOrder.find((color) => !completedColors.includes(color)) ?? null;
}
