// 网格共享一棵包围盒树。三角面只作为双面边界，因此船舱、环孔和柱廊仍可通行。
function triangleDistance(v,a,b,c,x,y,z) {
  const ex=v[b]-v[a], ey=v[b+1]-v[a+1], ez=v[b+2]-v[a+2];
  const fx=v[c]-v[a], fy=v[c+1]-v[a+1], fz=v[c+2]-v[a+2];
  const px=x-v[a], py=y-v[a+1], pz=z-v[a+2];
  const nx=ey*fz-ez*fy, ny=ez*fx-ex*fz, nz=ex*fy-ey*fx, area=nx*nx+ny*ny+nz*nz;
  if(area>1e-14) {
    const u=(px*(fy*nz-fz*ny)+py*(fz*nx-fx*nz)+pz*(fx*ny-fy*nx))/area;
    const w=(px*(ny*ez-nz*ey)+py*(nz*ex-nx*ez)+pz*(nx*ey-ny*ex))/area;
    if(u>=0 && w>=0 && u+w<=1) {
      const d=px*nx+py*ny+pz*nz; return d*d/area;
    }
  }
  let best=Infinity;
  for(let i=0;i<3;i++){
    const sx=v[b]-v[a], sy=v[b+1]-v[a+1], sz=v[b+2]-v[a+2];
    const dx=x-v[a], dy=y-v[a+1], dz=z-v[a+2];
    const t=clamp((dx*sx+dy*sy+dz*sz)/max(1e-15,sx*sx+sy*sy+sz*sz),0,1);
    best=min(best,(dx-sx*t)**2+(dy-sy*t)**2+(dz-sz*t)**2);
    const tmp=a; a=b; b=c; c=tmp;
  }
  return best;
}

function surfaceTree(mesh,kind) {
  const rest=new Float32Array(mesh.vb), animated=kind===26||kind===30;
  const v=animated?rest.slice():rest, faces=mesh.ib;
  const order=Uint32Array.from({length:faces.length/3},(_,i)=>i*3);
  const nodes=[];
  function bounds(node) {
    for(let axis=0;axis<3;axis++){
      let lo=Infinity,hi=-Infinity;
      if(node.left){
        lo=min(node.left.lo[axis],node.right.lo[axis]); hi=max(node.left.hi[axis],node.right.hi[axis]);
      }else{
        for(let i=node.start;i<node.end;i++)for(let j=0;j<3;j++){
          const value=v[4*faces[order[i]+j]+axis]; lo=min(lo,value); hi=max(hi,value);
        }
      }
      node.lo[axis]=lo; node.hi[axis]=hi;
    }
  }
  const centers=new Float32Array(faces.length);
  for(let t=0;t<faces.length;t+=3)for(let a=0;a<3;a++)
    centers[t+a]=(v[4*faces[t]+a]+v[4*faces[t+1]+a]+v[4*faces[t+2]+a])/3;
  function build(start,end){
    const node={start,end,lo:[0,0,0],hi:[0,0,0],left:null,right:null};
    nodes.push(node); bounds(node);
    if(end-start>12){
      let axis=0;
      for(let a=1;a<3;a++)if(node.hi[a]-node.lo[a]>node.hi[axis]-node.lo[axis]) axis=a;
      order.subarray(start,end).sort((a,b)=>centers[a+axis]-centers[b+axis]);
      const mid=(start+end)>>1;
      node.left=build(start,mid); node.right=build(mid,end);
    }
    return node;
  }
  const root=build(0,order.length);
  let lastAngle=0, lastFrame=-1;
  function animate(){
    if(!animated||lastFrame===F[TIME]) return;
    lastFrame=F[TIME];
    const elapsed=min(60,max(0,F[TIME]-lastAction[kind===26?2:1]));
    const angle=kind===26?(elapsed>=6?0:TAU*sstep(0,6,elapsed)):.44*sin(9*elapsed)*exp(-1.3*elapsed);
    if(abs(angle-lastAngle)<.00001)return;
    lastAngle=angle;
    const c=cos(angle),s=sin(angle);
    for(let i=0;i<v.length;i+=4){
      const x=rest[i],y=rest[i+1],z=rest[i+2];
      if(kind===26 && y>1.5){v[i]=c*x-s*z;v[i+2]=s*x+c*z;}
      if(kind===30 && abs(x)<1.1 && y<4.4){v[i]=x-(y-4.38)*s;v[i+1]=4.38+(y-4.38)*c;}
    }
    for(let i=nodes.length-1;i>=0;i--)bounds(nodes[i]);
  }
  function nearest(node,x,y,z,limit){
    const dx=max(node.lo[0]-x,x-node.hi[0],0), dy=max(node.lo[1]-y,y-node.hi[1],0), dz=max(node.lo[2]-z,z-node.hi[2],0);
    if(dx*dx+dy*dy+dz*dz>=limit)return limit;
    if(node.left){
      limit=nearest(node.left,x,y,z,limit);
      return nearest(node.right,x,y,z,limit);
    }
    for(let k=node.start;k<node.end;k++){
      const t=order[k];
      limit=min(limit,triangleDistance(v,4*faces[t],4*faces[t+1],4*faces[t+2],x,y,z));
    }
    return limit;
  }
  // 沿局部 X 轴数穿面次数。半开边规则让相邻三角形的公共边只记一次。
  function crossings(node,x,y,z){
    if(x>=node.hi[0] || y<node.lo[1] || y>node.hi[1] || z<node.lo[2] || z>node.hi[2])return 0;
    if(node.left)return crossings(node.left,x,y,z)+crossings(node.right,x,y,z);
    let hits=0;
    for(let k=node.start;k<node.end;k++){
      const t=order[k],a=4*faces[t];let b=4*faces[t+1],c=4*faces[t+2];
      let area=(v[b+1]-v[a+1])*(v[c+2]-v[a+2])-(v[b+2]-v[a+2])*(v[c+1]-v[a+1]);
      if(abs(area)<1e-13)continue;
      if(area<0){const swap=b;b=c;c=swap;area=-area;}
      let start=b,end=c,other=a,hitX=0;
      for(let edge=0;edge<3;edge++){
        const dy=v[end+1]-v[start+1],dz=v[end+2]-v[start+2];
        const weight=dy*(z-v[start+2])-dz*(y-v[start+1]);
        if(weight<0 || (weight===0 && (dz<0 || (dz===0 && dy<=0))))break;
        hitX+=weight*v[other];
        if(edge===2 && hitX>x*area)hits++;
        const next=other;other=start;start=end;end=next;
      }
    }
    return hits;
  }
  function contains(x,y,z){
    return x>=root.lo[0] && x<=root.hi[0] && y>=root.lo[1] && y<=root.hi[1] &&
      z>=root.lo[2] && z<=root.hi[2] && (crossings(root,x,y,z)&1)!==0;
  }
  let radius=0;
  for(let i=0;i<v.length;i+=4) radius=max(radius,hypot(v[i],v[i+1],v[i+2]));
  return {root,radius,animate,nearest,contains};
}

function sceneSurfaces(meshes,world) {
  const width=6, cells=Math.ceil(384/width);
  const grid=Array.from({length:cells*cells},()=>[]), trees=[];
  const gravel=Array.from({length:grid.length},()=>[]);
  const cell=(v,origin)=>clamp(floor((v-origin)/width),0,cells-1);
  function register(kind,data,start,count){
    if(!count)return;
    const jelly=kind===28;
    const tree=jelly?null:(trees[kind]??=surfaceTree(meshes[kind],kind));
    for(let k=start;k<start+count;k++){
      const i=k*12,scale=data[i+3];
      const x=data[i],y=data[i+1],z=data[i+2],bob=data[i+11],seed=data[i+9];
      const rock=kind<=3 || (kind>=14 && kind<=20);
      const radius=(jelly?1.8:tree.radius)*scale+abs(bob)+(jelly?.9:0);
      const pad=radius+1.02;
      const row0=cell(z-pad,OZ),row1=cell(z+pad,OZ),col0=cell(x-pad,OX),col1=cell(x+pad,OX);
      // 贴底的小石子只存四个数，包围球覆盖最突出的棱角。
      if(rock && !bob && scale<.38){
        for(let row=row0;row<=row1;row++)for(let col=col0;col<=col1;col++)
          gravel[row*cells+col].push(x,y,z,radius);
        continue;
      }
      const qx=data[i+4],qy=data[i+5],qz=data[i+6],qw=data[i+7];
      const inv=[1-2*(qy*qy+qz*qz),2*(qx*qy+qw*qz),2*(qx*qz-qw*qy),
        2*(qx*qy-qw*qz),1-2*(qx*qx+qz*qz),2*(qy*qz+qw*qx),
        2*(qx*qz+qw*qy),2*(qy*qz-qw*qx),1-2*(qx*qx+qy*qy)];
      const item={x,y,z,scale,seed,bob,inv,radius,tree,jelly,rock};
      for(let row=row0;row<=row1;row++)
        for(let col=col0;col<=col1;col++)grid[row*cells+col].push(item);
    }
  }
  for(const kind of [0,1,2,3,10,11,26,27,28,29,30])
    register(kind,world.solids.data,...world.solids.ranges[kind]);
  for(let i=0;i<6;i++)register(4+i,world.props[i].data,0,world.props[i].n);
  for(let i=0;i<7;i++)register(14+i,world.chunks[i].data,0,world.chunks[i].n);
  for(let i=0;i<gravel.length;i++)gravel[i]=new Float32Array(gravel[i]);
  return (x,y,z,density)=>{
    const bucket=cell(x,OX)+cells*cell(z,OZ),pebbles=gravel[bucket];
    for(let i=0;i<pebbles.length;i+=4){
      const dx=x-pebbles[i],dy=y-pebbles[i+1],dz=z-pebbles[i+2],r=pebbles[i+3];
      if(max(abs(dx),abs(dy),abs(dz))<r-density)density=max(density,r-sqrt(dx*dx+dy*dy+dz*dz));
    }
    for(const item of grid[bucket]){
      const {radius,scale,inv,tree}=item;
      const dx=x-item.x,dz=z-item.z;let dy=y-item.y;
      if(max(abs(dx),abs(dy),abs(dz))>radius+1 || dx*dx+dy*dy+dz*dz>(radius+1)**2)continue;
      dy-=item.bob*sin(F[TIME]*.3+item.seed*40);
      if(item.jelly){
        // 伞体与水母着色器同相位漂动，细触须作为柔软组织处理。
        const phase=F[TIME]*1.6+item.seed*45, pulse=.94+.12*sin(phase);
        const a=1.5*scale*pulse,b=scale*(2-pulse);
        const d=hypot((dx-.55*cos(phase*.28))/a,(dy-.4*sin(phase*.5)-.28*scale)/b,(dz-.35*sin(phase*.28))/a);
        density=max(density,(1-d)*min(a,b));continue;
      }
      if(density>=0 && !item.rock)continue;
      const lx=(dx*inv[0]+dy*inv[1]+dz*inv[2])/scale;
      const ly=(dx*inv[3]+dy*inv[4]+dz*inv[5])/scale;
      const lz=(dx*inv[6]+dy*inv[7]+dz*inv[8])/scale;
      tree.animate();
      if(item.rock && tree.contains(lx,ly,lz)){
        const depth=sqrt(tree.nearest(tree.root,lx,ly,lz,4*tree.radius*tree.radius))*scale;
        density=max(density,depth);continue;
      }
      if(density>=0)continue;
      const limit=(-density/scale)**2;
      const squared=tree.nearest(tree.root,lx,ly,lz,limit);
      if(squared<limit)density=-sqrt(squared)*scale;
    }
    return density;
  };
}
