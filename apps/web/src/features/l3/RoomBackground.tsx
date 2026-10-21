import {type State} from "./model";
import {Layer} from "./SceneLayer";
import {Television} from "./Television";

/** The prepared room remains identical when choosing an item to carry. */
export function RoomBackground({choices}:{choices:State["choices"]}) {
  const storm=choices.close===true;
  const opened=choices.open===true;
  return <g data-room-background>
    <defs>
      <clipPath id="l3-left-window"><rect x="690" y="0" width="610" height="670"/></clipPath>
      <mask id="l3-open-curtain" maskUnits="userSpaceOnUse" x="1459.363" y="9.469" width="521.637" height="818.581" style={{maskType:"alpha"}}><image href="/game/l3/open-curtain-mask.svg" x="1459.363" y="9.469" width="521.637" height="818.581"/></mask>
      <mask id="l3-closed-curtain" maskUnits="userSpaceOnUse" x="1459.363" y="9.469" width="521.637" height="818.581" style={{maskType:"alpha"}}><image href="/game/l3/curtain-mask.svg" x="1459.363" y="9.469" width="521.637" height="818.581"/></mask>
    </defs>
    {storm ? choices.window ? <Layer name="closed-window"/> : <Layer name="storm" crop={[-.0064,-.046,1.1262,1.0951]}/> : opened ? <Layer name="outside" crop={[-.0082,-.0501,1.1297,1.0985]}/> : <Layer name="entry" x={-15} crop={[-.0064,-.0539,1.1392,1.1077]}/>}
    {choices.curtain ? <g mask="url(#l3-open-curtain)"><Layer name={choices["right-window"]?"open-curtain":"open-curtain-window-open"} x={-129} y={-18} w={2071} h={1115}/></g> : storm && choices.window && <g mask="url(#l3-closed-curtain)"><Layer name="curtain" x={49.5} y={-51.5} w={2106} h={1134} crop={[-.013,.0004,1.013,.9994]}/></g>}
    {/* Keep the left window independent of the door and right curtain choices. */}
    {!storm&&choices.window&&<g clipPath="url(#l3-left-window)" data-closed-left-window><Layer name="closed-window"/></g>}
    <Television off={choices.television===true}/>
  </g>;
}
