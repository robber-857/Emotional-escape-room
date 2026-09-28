// Only foreground, unobstructed search intervals contribute; wall-clock dates never do.
export class SearchClock {
 private total=0;private since:number|null=null;
 constructor(private now:()=>number=()=>performance.now()){}
 resume(){if(this.since===null)this.since=this.now();}
 pause(){if(this.since!==null){this.total+=Math.max(0,this.now()-this.since);this.since=null;}}
 read(){return Math.floor(this.total+(this.since===null?0:Math.max(0,this.now()-this.since)));}
}
