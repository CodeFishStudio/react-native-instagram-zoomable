// @flow

const SCALE_MULTIPLIER = 1;

export default function getScale(
    currentDistance: number,
    initialDistance: number
) {
    return currentDistance / initialDistance * SCALE_MULTIPLIER;
}