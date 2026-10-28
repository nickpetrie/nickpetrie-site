// Brand marks inlined as SVG, so they inherit the page's ink colour and cost no extra request.
import npMark from '../assets/brand/np-mark.svg?raw';
import masthead from '../assets/brand/wnmp-masthead.svg?raw';

const inline = (svg: string, cls: string) =>
  svg.replace(/<title>.*?<\/title>/, '').replace(/ fill="#1F2834"/, '').replace('<svg ', `<svg class="${cls}" aria-hidden="true" focusable="false" `);

export const npMarkSvg = inline(npMark, 'np-mark');
export const mastheadSvg = inline(masthead, 'mast');
