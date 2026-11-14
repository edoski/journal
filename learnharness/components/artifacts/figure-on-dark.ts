/** A figure drawn for the dark page (round 3: the white figure was a bright
 *  panel in a dark-only app). The figure maker draws dark lines on white,
 *  which prints and downloads well; on screen the image is inverted, its
 *  hues turned back, by 1 − 18/255, so its white lands on the page's own
 *  #121212 instead of black, and its lines read light. */
export const FIGURE_ON_DARK = `invert(${1 - 18 / 255}) hue-rotate(180deg)`;
