import card01 from "./copy/01-elephant.json";
import card02 from "./copy/02-whale.json";
import card03 from "./copy/03-dolphin.json";
import card04 from "./copy/04-tiger.json";
import card05 from "./copy/05-dog.json";
import card06 from "./copy/06-eagle.json";
import card07 from "./copy/07-cat.json";
import card08 from "./copy/08-bird.json";
import card09 from "./copy/09-fox.json";
import card10 from "./copy/10-rabbit.json";
import card11 from "./copy/11-deer.json";
import card12 from "./copy/12-koala.json";
import card13 from "./copy/13-panda.json";
import card14 from "./copy/14-penguin.json";
import card15 from "./copy/15-ideal-deer.json";
import card16 from "./copy/16-hedgehog.json";
export type StarCopy={title:string;body:string};
export type CardRatingCopy={portraitId:string;authenticity:Record<string,StarCopy|null>;love:Record<string,StarCopy|null>};
export const ratingCopies:CardRatingCopy[]=[card01,card02,card03,card04,card05,card06,card07,card08,card09,card10,card11,card12,card13,card14,card15,card16];
export function resolveRatingCopy(portraitId:string,metric:'authenticity'|'love',stars:number):StarCopy|null{
 if(!Number.isInteger(stars)||stars<1||stars>5)return null;
 return ratingCopies.find(card=>card.portraitId===portraitId)?.[metric][String(stars)]??null;
}
