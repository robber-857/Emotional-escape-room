import {Layer} from "./SceneLayer";

/** Same television and power switch in both L3 scenes. */
export function Television({off}:{off:boolean}) {
 return <g data-television-power={off?"off":"on"}>
  <rect data-layer="tv-black-screen" x="1321" y="668" width="157" height="129" rx="22" fill="#111"/>
  {!off&&<Layer name="tv-screen" x={1321} y={668} w={157} h={129}/>}
  <Layer name="tv" x={1306} y={630} w={211} h={211}/>
  <defs><linearGradient id="l3-tv-switch" x2="0" y2="1"><stop stopColor="#d9d9d9"/><stop offset="1" stopColor="#737373"/></linearGradient></defs>
  <rect x="1342" y="530.5625" width="29.474" height="30.31" fill="url(#l3-tv-switch)"/>
  <rect data-layer="tv-power" x="1342" y="519" width="29" height="7" fill={off?"#ee2222":"#00ffa6"} stroke="#0005"/>
 </g>;
}
