/** Bounded rolling sample window for opt-in diagnostics. Times are milliseconds. */
export class FrameMetrics {
  private rows: {frame:number;cpu:number;gpu:number|null}[]=[];
  constructor(private readonly limit=300) {}
  add(frame:number,cpu:number,gpu:number|null){
    if(!Number.isFinite(frame)||frame<=0||!Number.isFinite(cpu)||cpu<0)return;
    this.rows.push({frame,cpu,gpu:gpu!==null&&Number.isFinite(gpu)&&gpu>=0?gpu:null});
    if(this.rows.length>this.limit)this.rows.shift();
  }
  summary(){
    const percentile=(values:number[],q:number)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1]:null;
    const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/(values.length||1);
    const frame=this.rows.map(x=>x.frame),cpu=this.rows.map(x=>x.cpu),gpu=this.rows.flatMap(x=>x.gpu===null?[]:[x.gpu]);
    return {samples:this.rows.length,fps:frame.length?1000/mean(frame):0,cpu:mean(cpu),frameP95:percentile(frame,.95),cpuP95:percentile(cpu,.95),gpuP95:percentile(gpu,.95)};
  }
}
