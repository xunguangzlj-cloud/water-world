// 以列为单位组合两个仿射变换，只在有发束或衣摆的骨骼上计算。
function composeWaterBone(out,k,a,i,b,j) {
  for(let col=0;col<4;col++) {
    const q=j+4*col, dst=k+4*col, x=b[q], y=b[q+1], z=b[q+2];
    for(let row=0;row<3;row++)
      out[dst+row]=a[i+row]*x+a[i+4+row]*y+a[i+8+row]*z+(col===3?a[i+12+row]:0);
    out[dst+3]=col===3?1:0;
  }
}

// 原角色保留服饰图集和蒙皮，动作由水下骨骼姿势驱动。
async function prepareAvatar() {
  const tag = document.getElementById('actor-data');
  let compressed;
  if (tag.dataset.src) {
    const response = await fetch(tag.dataset.src);
    if (!response.ok) throw Error('角色资源加载失败，请刷新重试');
    compressed = response.body;
  } else {
    const encoded = tag.textContent.trim(), chunks = [];
    for (let i = 0; i < encoded.length; i += 65536) {
      chunks.push(Uint8Array.from(atob(encoded.slice(i,i+65536)), c=>c.charCodeAt(0)));
    }
    compressed = new Blob(chunks).stream();
  }
  const raw = await new Response(compressed.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const head = new DataView(raw).getUint32(0,true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,head)));
  let offset = 4+head;
  const [vertices,indices,animation,picture] = meta.lengths.map(size=>{
    const part=new Uint8Array(raw,offset,size); offset+=size; return part;
  });
  const vertexBuffer=buf(vertices,BU.VERTEX), indexBuffer=buf(indices,BU.INDEX), indexCount=indices.byteLength/4;
  const samples=new Float32Array(animation.slice().buffer), stride=meta.bones*16;
  const pose=new Float32Array(stride), from=new Float32Array(stride);
  const wetPose=new Float32Array(stride), chain=new Float32Array(stride);
  for(let i=0;i<stride;i+=16) chain[i]=chain[i+5]=chain[i+10]=chain[i+15]=1;
  const bend=new Float32Array(16), lagSide=new Float32Array(meta.bones), lagBack=new Float32Array(meta.bones);
  bend[15]=1;
  const skin=device.createBuffer({size:pose.byteLength,usage:BU.STORAGE|BU.COPY_DST});
  const placement=new Float32Array(8);
  const transform=device.createBuffer({size:32,usage:BU.UNIFORM|BU.COPY_DST});
  const jointCenters=new Float32Array(meta.guards.length*4);
  const jointUniform=device.createBuffer({size:jointCenters.byteLength,usage:BU.UNIFORM|BU.COPY_DST});
  const bitmap=await createImageBitmap(new Blob([picture],{type:'image/webp'}));
  const atlas=tex(bitmap.width,bitmap.height,'rgba8unorm',TU.TEXTURE_BINDING|TU.COPY_DST|TU.RENDER_ATTACHMENT);
  Q.copyExternalImageToTexture({source:bitmap},{texture:atlas},[bitmap.width,bitmap.height]); bitmap.close();
  const layout=device.createBindGroupLayout({entries:[
    {binding:0,visibility:SS.VERTEX,buffer:{type:'read-only-storage'}},
    {binding:1,visibility:SS.VERTEX,buffer:{}},
    {binding:2,visibility:SS.FRAGMENT,texture:{}},
    {binding:3,visibility:SS.VERTEX,buffer:{}}
  ]});
  const group=device.createBindGroup({layout,entries:[
    {binding:0,resource:{buffer:skin}}, {binding:1,resource:{buffer:transform}}, {binding:2,resource:atlas.createView()},
    {binding:3,resource:{buffer:jointUniform}}
  ]});
  const shader=mod(S_B + /*wgsl*/`
    @group(1) @binding(0) var<storage,read> bones: array<mat4x4f>;
    struct Body { origin:vec4f, heading:vec4f };
    @group(1) @binding(1) var<uniform> body:Body;
    @group(1) @binding(2) var atlas:texture_2d<f32>;
    @group(1) @binding(3) var<uniform> joint:array<vec4f,12>;
    fn clearLimb(p:vec3f,a:vec3f,b:vec3f,r:f32)->vec3f {
      let ab=b-a;
      let d=p-(a+ab*clamp(dot(p-a,ab)/max(dot(ab,ab),.000001),0.,1.));
      let len=length(d);
      return p+max(0.,r-len)*select(vec3f(1.,0.,0.),d/max(len,.00001),len>.00001);
    }
    struct Out { @builtin(position) cp:vec4f,@location(0) wp:vec3f,@location(1) n:vec3f,@location(2) uv:vec2f,@location(3) lining:f32 };
    @vertex fn avatarVS(@location(0) p:vec4f,@location(1) n:vec4f,@location(2) uv:vec2f,@location(3) joints:vec4u,@location(4) weights:vec4f)->Out {
      let w = weights / max(.001,dot(weights,vec4f(1.)));
      let skin = bones[joints.x]*w.x + bones[joints.y]*w.y + bones[joints.z]*w.z + bones[joints.w]*w.w;
      let f=vec3f(body.heading.x,0.,body.heading.z); let right=normalize(cross(f,vec3f(0.,1.,0.)));
      let axis=mat3x3f(f,cross(right,f),right);
      let angle=body.heading.w; let c=cos(angle); let s=sin(angle);
      let tilt=mat3x3f(vec3f(c,-s,0.),vec3f(s,c,0.),vec3f(0.,0.,1.));
      let cb=cos(body.heading.y); let sb=sin(body.heading.y);
      let bank=mat3x3f(vec3f(1.,0.,0.),vec3f(0.,cb,sb),vec3f(0.,-sb,cb));
      let attitude=bank*tilt;
      let pivot=vec3f(.055,.41,.002);
      var surface=(skin*vec4f(p.xyz,1.)).xyz;
      if(n.w>.10 && n.w<.38){
        surface=clearLimb(surface,joint[2].xyz,joint[3].xyz,.055);
        surface=clearLimb(surface,joint[5].xyz,joint[6].xyz,.055);
        surface=clearLimb(surface,joint[3].xyz,joint[4].xyz,.045);
        surface=clearLimb(surface,joint[6].xyz,joint[7].xyz,.045);
      }else if(n.w>.38 && n.w<.72){
        surface=clearLimb(surface,joint[0].xyz,joint[1].xyz,.101);
        surface=clearLimb(surface,joint[8].xyz,joint[9].xyz,.046);
        surface=clearLimb(surface,joint[10].xyz,joint[11].xyz,.046);
      }
      let local=pivot+attitude*(surface-pivot);
      let wp=body.origin.xyz + axis*local*body.origin.w;
      return Out(g.vp*vec4f(wp,1.),wp,normalize(axis*attitude*(skin*vec4f(n.xyz,0.)).xyz),uv,select(0.,1.,n.w>.9));
    }
    @fragment fn avatarFS(i:Out)->@location(0) vec4f {
      let base=mix(textureSample(atlas,sC,i.uv).rgb,vec3f(.116,.19,.27),i.lining);
      let n=normalize(i.n); let light=.65+.35*max(0.,dot(n,g.sun.xyz));
      let c=pow(base,vec3f(1.8))*light*vec3f(.80,.92,.99);
      return fin(fog(c,i.wp,zone(i.wp)));
    }
  `);
  const pipeline=device.createRenderPipeline({
    layout:device.createPipelineLayout({bindGroupLayouts:[bgl0,layout]}),
    vertex:{module:shader,entryPoint:'avatarVS',buffers:[{arrayStride:24,attributes:[
      A(0,0,'snorm16x4'),A(1,8,'snorm8x4'),A(2,12,'unorm16x2'),A(3,16,'uint8x4'),A(4,20,'unorm8x4')
    ]}]},
    fragment:{module:shader,entryPoint:'avatarFS',targets:[{format:HDR}]},primitive:{topology:'triangle-list'},
    depthStencil:{format:DEPTH,depthWriteEnabled:true,depthCompare:'greater'},multisample:{count:AA}
  });
  let clip='', started=0, previous=false, phase=0, lastTime=-1, lastEntry=-1;
  return (pass,x,y,z,yaw,lean,bank,name,now,gestureTime)=>{
    const reset=lastEntry!==waterEntry || lastTime<0 || now-lastTime>.32;
    const dt=reset?0:min(.1,now-lastTime);
    lastTime=now; lastEntry=waterEntry;
    const speed=hypot(F[VX],F[VY],F[VZ]);
    if(name!==clip) {
      previous=!!clip; from.set(pose); clip=name; started=now; phase=0;
    }
    const [first,count,duration]=meta.clips[clip], elapsed=max(0,now-started);
    const cadence=name==='flutter'?mix(.78,1.18,sstep(9,26,speed)):
      name==='breaststroke'?mix(.75,1.10,sstep(1,9,speed)):1;
    phase=(phase+dt*cadence)%duration;
    const sample=(gestureTime>=0?min(gestureTime,duration):phase)*(count-1)/duration;
    const idx=min(count-1,floor(sample)), f=sample-idx;
    const a=(first+idx)*stride, b=(first+min(idx+1,count-1))*stride;
    const blend=previous ? sstep(0,.28,elapsed) : 1;
    for(let j=0;j<stride;j++) pose[j]=mix(from[j],mix(samples[a+j],samples[b+j],f),blend);
    wetPose.set(pose);
    // 缓流固定在海域内，两种波长叠加。把相对水速投影到角色左右和前后方向。
    const vx=.78*sin(x*.052+z*.065+now*.91)+.43*sin(y*.14-now*.47)-F[VX];
    const vz=.72*cos(z*.063-x*.047+now*.74)+.33*sin(x*.08+now*.52)-F[VZ];
    const sy=sin(yaw), cy=cos(yaw);
    const crossFlow=vx*cy+vz*sy, foreFlow=vx*sy-vz*cy;
    const sideForce=clamp(-.17*crossFlow+.65*bank,-.65,.65);
    const backForce=clamp(.11*foreFlow*cos(lean)+.055*F[VY]*sin(lean)-.066*speed,-.67,.45);
    for(const [bone,parent,px,py,pz,kind,strand,depth] of meta.strands) {
      const i=bone*16, pi=parent*16;
      if(depth===4) {
        chain.copyWithin(i,pi,pi+16);
      } else {
        // 发根和腰线固定得较紧；下一节接收上一节滞后的扰动，刘海幅度最小。
        const response=kind===0?5.4:kind===1?8.2:6.7;
        const gain=reset?1:1-exp(-dt*response);
        const ripple=sin(now*(kind===2?1.46:1.18)+strand*.78-depth*.43+x*.06+z*.03);
        let side=sideForce+.066*ripple, back=backForce+.058*sin(now*1.25+strand*.65-depth*.56);
        if(depth>1) {
          side=mix(side,lagSide[parent],.80);
          back=mix(back,lagBack[parent],.80);
        }
        lagSide[bone]+=(side-lagSide[bone])*gain;
        lagBack[bone]+=(back-lagBack[bone])*gain;
        const weight=(kind===0?.88:kind===1?.42:.64)*(depth===1?.40:depth===2?.72:1);
        // 平游时水流沿着长发和裙片流过，限制各节累积向后翻卷的角度。
        const stream=mix(1,kind===0?.21:kind===2?.36:1,sstep(1,5,speed));
        let ax=lagSide[bone]*weight, az=lagBack[bone]*weight*stream;
        // 限制指向身体中心的偏转，向外或沿衣摆切线的摆动仍然保留。
        const radial=max(.001,hypot(px-.055,pz-.002)), nx=(px-.055)/radial, nz=(pz-.002)/radial;
        const inward=min(0,az*nx-ax*nz+(kind===2?.055:.11));
        ax+=inward*nz; az-=inward*nx;
        const cx=cos(ax), sx=sin(ax), cz=cos(az), sz=sin(az);
        bend[0]=cz; bend[1]=sz; bend[2]=0;
        bend[4]=-sz*cx; bend[5]=cz*cx; bend[6]=sx;
        bend[8]=sz*sx; bend[9]=-cz*sx; bend[10]=cx;
        const bx=pose[i]*px+pose[i+4]*py+pose[i+8]*pz+pose[i+12];
        const by=pose[i+1]*px+pose[i+5]*py+pose[i+9]*pz+pose[i+13];
        const bz=pose[i+2]*px+pose[i+6]*py+pose[i+10]*pz+pose[i+14];
        bend[12]=bx-(bend[0]*bx+bend[4]*by+bend[8]*bz);
        bend[13]=by-(bend[1]*bx+bend[5]*by+bend[9]*bz);
        bend[14]=bz-(bend[6]*by+bend[10]*bz);
        composeWaterBone(chain,i,chain,pi,bend,0);
      }
      composeWaterBone(wetPose,i,chain,i,pose,i);
    }
    placement.set([x,y-1.18,z,1.7,sy,bank,-cy,lean]);
    for(let n=0;n<meta.guards.length;n++){
      const [joint,px,py,pz]=meta.guards[n], j=joint*16;
      for(let row=0;row<3;row++)
        jointCenters[4*n+row]=pose[j+row]*px+pose[j+4+row]*py+pose[j+8+row]*pz+pose[j+12+row];
    }
    Q.writeBuffer(jointUniform,0,jointCenters);
    Q.writeBuffer(skin,0,wetPose); Q.writeBuffer(transform,0,placement);
    pass.setPipeline(pipeline); pass.setBindGroup(1,group); pass.setVertexBuffer(0,vertexBuffer);
    pass.setIndexBuffer(indexBuffer,'uint32'); pass.drawIndexed(indexCount);
  };
}
