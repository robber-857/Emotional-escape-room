/** Figma image-fill crop, in the scene's original coordinate system. */
export function Layer({name,x=0,y=0,w=1920,h=1049,crop=[0,0,1,1],opacity=1}:{name:string;x?:number;y?:number;w?:number;h?:number;crop?:number[];opacity?:number}) {
  return <svg data-layer={name} x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="hidden" opacity={opacity}>
    <image href={`/game/l3/${name}.png`} x={w*crop[0]} y={h*crop[1]} width={w*crop[2]} height={h*crop[3]} preserveAspectRatio="none"/>
  </svg>;
}
