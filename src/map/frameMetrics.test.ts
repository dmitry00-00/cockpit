import {expect,it} from 'vitest';
import {FrameMetrics} from './frameMetrics';
it('reports actual frame outliers, excludes invalid samples and bounds the rolling window',()=>{
  const samples=new FrameMetrics(20);
  samples.add(NaN,1,1);samples.add(16,-1,null);
  for(let i=0;i<18;i++)samples.add(16,1,null);
  samples.add(50,4,7);samples.add(100,8,11);
  expect(samples.summary()).toEqual({samples:20,fps:1000/(18*16+150)*20,cpu:(18+12)/20,frameP95:50,cpuP95:4,gpuP95:11});
  for(let i=0;i<20;i++)samples.add(20,2,3);
  expect(samples.summary()).toEqual({samples:20,fps:50,cpu:2,frameP95:20,cpuP95:2,gpuP95:3});
});
