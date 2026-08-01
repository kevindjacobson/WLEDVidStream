export function getCoverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if ([sourceWidth, sourceHeight, targetWidth, targetHeight].some((value) => value <= 0)) {
    throw new RangeError('Video and target dimensions must be positive');
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const width = Math.round(sourceHeight * targetAspect);
    return {
      x: Math.round((sourceWidth - width) / 2),
      y: 0,
      width,
      height: sourceHeight,
    };
  }

  const height = Math.round(sourceWidth / targetAspect);
  return {
    x: 0,
    y: Math.round((sourceHeight - height) / 2),
    width: sourceWidth,
    height,
  };
}

export function rgbaToRgb(rgba) {
  if (rgba.length % 4 !== 0) {
    throw new RangeError('Canvas data must contain complete RGBA pixels');
  }

  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    rgb[target] = rgba[source];
    rgb[target + 1] = rgba[source + 1];
    rgb[target + 2] = rgba[source + 2];
  }
  return rgb;
}

function punchyTone(value) {
  const normalized = value / 255;
  const contrasted = normalized * normalized * (3 - (2 * normalized));
  return 255 * (contrasted ** 1.35);
}

export function applyPunchyGrade(rgba) {
  if (rgba.length % 4 !== 0) {
    throw new RangeError('Canvas data must contain complete RGBA pixels');
  }

  for (let pixel = 0; pixel < rgba.length; pixel += 4) {
    const red = punchyTone(rgba[pixel]);
    const green = punchyTone(rgba[pixel + 1]);
    const blue = punchyTone(rgba[pixel + 2]);
    const luminance = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);

    rgba[pixel] = luminance + ((red - luminance) * 1.35);
    rgba[pixel + 1] = luminance + ((green - luminance) * 1.35);
    rgba[pixel + 2] = luminance + ((blue - luminance) * 1.35);
  }

  return rgba;
}

export function canvasToRgb(context, width, height) {
  return rgbaToRgb(context.getImageData(0, 0, width, height).data);
}
