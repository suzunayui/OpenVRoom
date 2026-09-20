import { mkdir, writeFile } from 'node:fs/promises';
import { Quaternion, Euler } from 'three';
import { createBuilder } from './glb';
import { validateAsset } from '../src/core/format';

await mkdir('public/rooms', { recursive: true });
for (const theme of ['cafe', 'library', 'garden'] as const) {
  const b = createBuilder();
  const titles = { cafe: 'ボタニカルカフェ', library: '雨音の書斎', garden: '月庭の和室' };
  const descriptions = { cafe: '深緑のソファと真鍮の灯り。植物に囲まれて、ゆっくり話そう。', library: '壁いっぱいの本棚と暖炉のある静かな書斎。窓辺に、お気に入りの一席を。', garden: '畳の座敷から眺める小さな庭。池と飛び石、竹の影がつくる穏やかな居場所。' };
  b.json.extensionsUsed = ['OPENVROOM_room', 'OPENVROOM_components'];
  b.json.extensions = { OPENVROOM_room: { version: '0.1', title: titles[theme], description: descriptions[theme], author: 'OpenVRoom', units: 'meters', background: theme === 'garden' ? '#92a8b0' : theme === 'library' ? '#879ca9' : '#c4d5cb' } };
  const mat = (name: string, color: string, rough = 0.8) => b.material(name, color, rough);
  const plaster = mat('Mineral plaster', theme === 'library' ? '#928375' : '#ded5bf');
  const wood = mat('Walnut', theme === 'garden' ? '#71604d' : '#79543e');
  const oak = mat('Oak edge', '#ba8d58');
  const dark = mat('Blackened steel', '#283330', .35);
  const brass = mat('Brushed brass', '#b79b59', .32); b.json.materials[brass].pbrMetallicRoughness.metallicFactor = .65;
  const cream = mat('Linen', '#e0d8bd');
  const green = mat('Velvet moss', '#456759');
  const leaf = mat('Foliage', '#567647');
  const leafLight = mat('Young leaves', '#829763');
  const clay = mat('Ceramic', '#af7156', .4);
  const paper = mat('Paper', '#dfcfa8');
  const blue = mat('Ink blue', '#4c6578');
  const red = mat('Wine', '#885551');
  const lamp = mat('Warm diffuser', '#f3d39a'); b.json.materials[lamp].emissiveFactor = [.38, .23, .09];
  const obj = (name: string, shape: string, m: number, p: number[], scale: number[], solid = false, rotation?: number[]) => {
    const i = b.object(name, shape, m, p, scale, solid);
    if (rotation) b.json.nodes[i].rotation = new Quaternion().setFromEuler(new Euler(...rotation as [number, number, number])).toArray();
    return i;
  };
  const box = (n: string, m: number, p: number[], s: number[], solid = false) => obj(n, 'box', m, p, s, solid);
  const round = (n: string, m: number, p: number[], s: number[], solid = false) => obj(n, 'rounded', m, p, s, solid);
  const cyl = (n: string, m: number, p: number[], s: number[], solid = false) => obj(n, 'cylinder', m, p, s, solid);
  function plant(x: number, z: number, height = 1.8) {
    cyl('Ceramic planter', clay, [x,.25,z],[.5,.5,.5],true);
    cyl('Planter rim', clay,[x,.49,z],[.55,.08,.55]);
    cyl('Soil',dark,[x,.52,z],[.44,.02,.44]);
    cyl('Stem',wood,[x,height/2+.4,z],[.035,height-.2,.035]);
    for(let j=0;j<10;j++) { const a=j*2.4; obj('Leaf','sphere', j%2?leaf:leafLight,[x+Math.cos(a)*.24,.7+j*(height-.6)/10,z+Math.sin(a)*.24],[.43,.06,.22],false,[.3, a, .25]); }
  }
  function sofa(x:number,z:number,width=2.8) {
    for(const dx of [-width/2+.18,width/2-.18])for(const dz of [-.35,.35])cyl('Sofa foot',brass,[x+dx,.12,z+dz],[.065,.24,.065]);
    round('Sofa frame',green,[x,.38,z],[width,.42,1],true);
    round('Upholstered back',green,[x,.86,z-.43],[width, .8,.24],true);
    for(const dx of [-width/2+.1,width/2-.1])round('Rounded arm',green,[x+dx,.63,z],[.22,.5,1.05],true);
    for(let i=0;i<3;i++) {
      round('Seat cushion',green,[x+(i-1)*(width-.45)/3,.64,z+.02],[(width-.5)/3,.18,.76]);
      round('Pillow',i%2?clay:cream,[x+(i-1)*(width-.6)/3,.95,z-.28],[.5,.47,.14]);
    }
  }
  function table(x:number,z:number) {
    cyl('Bistro top',oak,[x,.73,z],[1.15,.09,1.15],true);
    cyl('Table stem',dark,[x,.37,z],[.09,.7,.09]); cyl('Table base',dark,[x,.06,z],[.58,.08,.58],true);
    cyl('Saucer',cream,[x+.23,.785,z],[.22,.018,.22]);cyl('Cup',cream,[x+.23,.85,z],[.13,.12,.13]);
    cyl('Coffee',wood,[x+.23,.913,z],[.105,.005,.105]);
    obj('Cup handle','torus',cream,[x+.31,.85,z],[.08,.09,.045]);
    box('Notebook',blue,[x-.2,.797,z+.1],[.25,.035,.32]);
  }
  function lampAt(x:number,z:number,y=2.7) {
    cyl('Pendant cable',dark,[x,3.3,z],[.015,1,.015]);
    cyl('Pendant shade',brass,[x,y,z],[.62,.2,.62]);
    cyl('Diffuser',lamp,[x,y-.105,z],[.55,.015,.55]);
  }
  // Shared enclosed footprint, with a low front edge that keeps the camera open.
  box('Floor structure',wood,[0,-.15,0],[12,.3,10],true);
  box('Back wall',plaster,[0,1.9,-5],[12,3.8,.18],true);
  box('Left wall',plaster,[-6,1.9,0],[.18,3.8,10],true);
  box('Front parapet',wood,[0,.2,5],[12,.4,.16],true);
  box('Right sill',wood,[6,.4,0],[.18,.8,10],true);
  const boundary = b.json.nodes.push({ name:'Window boundary',translation:[6,2,0],extensions:{OPENVROOM_components:{components:[{type:'collider',size:[.18,4,10],center:[0,0,0]}]}}})-1;b.json.scenes[0].nodes.push(boundary);
  for(const z of [-4.8,-2.4,0,2.4,4.8])box('Window mullion',wood,[6,2.25,z],[.1,3.1,.1]);
  box('Window lintel',wood,[6,3.77,0],[.16,.16,10]);
  box('Skirting',wood,[0,.13,-4.86],[12,.22,.1]);
  const boards = ['#b48c60','#b08a5f','#aa835b','#b89166'].map((color,i)=>mat(`Oak grain ${i}`,color));
  for(let i=0;i<22;i++)for(let j=0;j<5;j++)box('Floorboard',boards[(i*3+j)%4],[-5.72+i*.54,.008,-3.92+j*1.96],[.532,.015,1.95]);
  if(theme==='cafe') {
    box('Counter',wood,[-4.6,.52,-1.6],[1.65,1.04,4.8],true);
    round('Stone counter top',cream,[-4.6,1.08,-1.6],[1.85,.13,5],true);
    for(let i=0;i<31;i++)box('Counter fluting',oak,[-3.75,.54,-3.85+i*.15],[.05,.9,.06]);
    round('Espresso machine',dark,[-4.5,1.37,-3],[.85,.48,.58]);box('Espresso face',brass,[-4.04,1.4,-3],[.03,.25,.48]);
    for(let i=0;i<3;i++)cyl('Stacked crockery',cream,[-4.5,1.22,-1.8+i*.28],[.18,.22,.18]);
    box('Menu board',dark,[-5.86,2.05,1.5],[.06,1.1,1.6]);
    for(let j=0;j<5;j++)box('Menu chalk',cream,[-5.82,2.4-j*.17,1.5],[.01,.018,j%2?1:.65]);
    sofa(.6,-3.75,3.6); round('Woven rug',cream,[.7,.023,-2.4],[4.6,.03,3.6]);
    table(.6,-2.05);table(3.8,.25); table(.1,1.5);
    for(const [x,z] of [[2.7,.25],[4.9,.25],[-1,1.5],[1.2,1.5]]) {
      cyl('Stool seat',green,[x,.49,z],[.62,.15,.62],true);
      for(const dx of [-.19,.19])for(const dz of [-.19,.19])cyl('Stool leg',wood,[x+dx,.23,z+dz],[.04,.46,.04]);
    }
    for(const [x,z] of [[.6,-2.05],[3.8,.25],[-4.6,-1.6]])lampAt(x,z);
    for(const [x,z] of [[4.9,-3.9],[4.9,3.8],[-4.9,3.8],[2.7,-4.1]])plant(x,z,2.1);
    for(const z of [-3.2,-1.6]) {
      box('Floating display shelf',oak,[-5.75,1.85,z],[.4,.065,1.25]);
      for(let i=0;i<4;i++)cyl('Coffee jar',i%2?clay:cream,[-5.71,2.03,z-.42+i*.28],[.17,.3,.17]);
    }
    round('Pastry board',wood,[-4.55,1.18,.35],[.7,.045,.85]);
    for(let i=0;i<3;i++)for(let j=0;j<2;j++)obj('Pastry','sphere',oak,[-4.75+j*.3,1.25,.1+i*.25],[.23,.12,.18]);
    // Slatted feature wall and framed botanical prints.
    for(let i=0;i<30;i++)box('Oak wall slat',oak,[-2.1+i*.21,2.1,-4.84],[.055,2.6,.06]);
    for(const x of [-.8,1.5]) {
      round('Picture frame',brass,[x,2.3,-4.73],[1.35,1.55,.08]);box('Print paper',paper,[x,2.3,-4.67],[1.2,1.4,.03]);
      for(let j=0;j<5;j++)obj('Botanical print leaf','sphere',green,[x+(j%2?.15:-.15),1.9+j*.18,-4.64],[.35,.14,.014],false,[0,0,j%2?.45:-.45]);
    }
  } else if(theme==='library') {
    const rug=mat('Burgundy rug','#733f45'); round('Reading rug',rug,[.2,.03,-.9],[6.5,.035,5.8]);
    for(const x of [-2.85,3.25])box('Rug border',paper,[x,.051,-.9],[.025,.006,5.5]);
    for(const z of [-3.55,1.75])box('Rug border',paper,[.2,.051,z],[6.1,.006,.025]);
    for(const x of [-4.4,-2.45,2.45,4.4]) {
      box('Bookcase back',wood,[x,1.7,-4.78],[1.8,3.35,.12]);
      for(const dx of [-.91,.91])box('Bookcase upright',wood,[x+dx,1.7,-4.5],[.09,3.4,.6],true);
      for(let row=0;row<5;row++) {
        const y=.18+row*.65;box('Book shelf',oak,[x,y,-4.5],[1.85,.055,.65],true);
        for(let k=0;k<9;k++) {
          const h=.3+((k*7+row*3)%5)*.045;const bx=x-.75+k*.18;const m=[blue,red,green,paper,clay][(k+row)%5];
          box('Book spine',m,[bx,y+h/2+.04,-4.38],[.13,h,.3]);
          for(const dy of [-h*.3,h*.3])box('Book gilt band',brass,[bx,y+h/2+.04+dy,-4.222],[.10,.014,.006]);
        }
      }
    }
    const stone=mat('Fireplace stone','#4c504b');
    round('Hearth',stone,[0,.13,-4.1],[2.2,.26,1.4],true);
    for(const x of [-.83,.83])box('Fireplace jamb',stone,[x,.83,-4.48],[.32,1.4,.65],true);
    box('Fireplace mantel',oak,[0,1.6,-4.4],[2.2,.15,.9],true);box('Firebox',dark,[0,.8,-4.78],[1.4,1.25,.08]);
    for(const x of [-.35,.1,.35])obj('Firewood','cylinder',wood,[x,.4,-4.35],[.18,.8,.18],false,[Math.PI/2,0,.15]);
    for(const x of [-.32,0,.32])obj('Ember','sphere',lamp,[x,.46,-4.22],[.15,.08,.12]);
    sofa(-.7,-1.8,2.5); table(-.7,-.15);
    box('Writing desk',wood,[4,.78,2],[2.6,.12,1.2],true);
    for(const x of [2.85,5.15])for(const z of [1.5,2.5])box('Desk leg',dark,[x,.36,z],[.06,.72,.06]);
    box('Writing paper',paper,[3.9,.851,2],[.55,.008,.4]);box('Pen',brass,[4,.865,2],[.2,.012,.012]);
    cyl('Desk lamp base',brass,[4.8,.87,1.85],[.28,.05,.28]);cyl('Desk lamp stem',brass,[4.8,1.13,1.85],[.035,.5,.035]);
    round('Green bankers shade',green,[4.8,1.38,1.85],[.6,.18,.3]);box('Desk lamp glow',lamp,[4.8,1.29,1.85],[.48,.015,.2]);
    round('Desk chair cushion',green,[4,.48,3],[.72,.18,.7],true);round('Desk chair back',green,[4,.95,3.32],[.75,.85,.17]);
    for(const dx of [-.26,.26])for(const dz of [-.25,.25])box('Chair leg',wood,[4+dx,.22,3+dz],[.05,.44,.05]);
    for(const z of [-3,0,3]) {box('Wall panel',wood,[-5.85,1.1,z],[.05,1.8,2.6]);box('Panel inset',plaster,[-5.8,1.1,z],[.025,1.55,2.35]);}
    for(let i=0;i<3;i++)box('Desk book stack', [red,blue,paper][i],[3.15,.88+i*.055,1.75],[.45,.045,.32]);
    obj('Mantel clock body','cylinder',brass,[0,2.12,-4.78],[.72,.12,.72],false,[Math.PI/2,0,0]);
    obj('Clock face','cylinder',paper,[0,2.12,-4.67],[.61,.025,.61],false,[Math.PI/2,0,0]);
    box('Clock hour hand',dark,[.065,2.18,-4.65],[.13,.025,.012]);box('Clock minute hand',dark,[0,2.23,-4.65],[.018,.22,.012]);
    plant(-4.8,3.8);lampAt(-.7,-.2,2.8);
  } else {
    const tatami=mat('Tatami rush','#aaa879');const edge=mat('Tatami border','#46534b');const stone=mat('Garden stone','#778079');const gravel=mat('Raked gravel','#b6b5a5');const water=mat('Still water','#537e80',.18);
    box('Garden gravel',gravel,[0,.015,0],[11.7,.02,9.7]);
    box('Engawa deck',wood,[-2.5,.055,-.4],[6,.1,8.7]);
    for(let i=0;i<9;i++)box('Veranda plank',oak,[.15,.112,-4.4+i*1.02],[.6,.015,1]);
    for(let x=0;x<2;x++)for(let z=0;z<3;z++) {box('Tatami mat',tatami,[-4.1+x*1.8,.12,-3+z*2.4],[1.76,.04,2.36]);for(const dx of [-.85,.85])box('Tatami seam',edge,[-4.1+x*1.8+dx,.143,-3+z*2.4],[.035,.006,2.36]);}
    for(let j=0;j<150;j++)box('Woven tatami grain',paper,[-3.2,.145,-4.12+j*.045],[3.5,.002,.003]);
    for(let i=0;i<25;i++)box('Gravel rake line',cream,[2.8,.03,-4.6+i*.38],[5.6,.008,.025]);
    round('Pond stone rim',stone,[3.2,.06,-1.7],[3.9,.13,3.2],true);round('Pond surface',water,[3.2,.13,-1.7],[3.65,.015,2.95]);
    for(let i=0;i<7;i++)obj('Pond border rock','sphere',stone,[2+i*.38,.2,-3.18+(i%2)*.06],[.4,.27,.32]);
    for(let i=0;i<6;i++){const a=i*2.2;cyl('Lily pad',leaf,[3.2+Math.cos(a)*1.1,.145,-1.7+Math.sin(a)*.9],[.34,.012,.34]);}
    for(let i=0;i<6;i++)round('Stepping stone',stone,[1.5+(i%2)*.2,.05,1+i*.58],[.8,.1,.45]);
    round('Low tea table',wood,[-2.6,.39,-1],[1.6,.1,1.1],true);for(const dx of [-.6,.6])for(const dz of [-.35,.35])box('Tea table leg',wood,[-2.6+dx,.2,-1+dz],[.09,.4,.09]);
    for(const z of [-2.1,.15])round('Floor cushion',green,[-2.6,.2,z],[.85,.16,.7]);
    cyl('Tea tray',dark,[-2.6,.452,-1],[.7,.018,.7]);obj('Teapot','sphere',clay,[-2.65,.56,-1.05],[.26,.21,.26]);cyl('Teapot lid',wood,[-2.65,.68,-1.05],[.16,.025,.16]);
    for(const x of [-2.35,-2.9])cyl('Tea cup',cream,[x,.51,-.8],[.13,.12,.13]);
    for(const x of [-4.6,-2.4,-.2]) {box('Shoji backing',paper,[x,2.05,-4.83],[2.05,3.3,.025]);for(let j=0;j<6;j++)box('Shoji horizontal',wood,[x,.5+j*.59,-4.79],[2.12,.035,.04]);for(let j=0;j<5;j++)box('Shoji vertical',wood,[x-.98+j*.49,2,-4.77],[.03,3.4,.04]);}
    for(const z of [-3,0,3])box('Timber column',wood,[-.6,1.9,z],[.13,3.8,.13],true);
    box('Timber beam',wood,[-.6,3.76,0],[.22,.2,9.7]);
    for(const [x,z] of [[4.9,-4.1],[4.9,3.8]]) {
      for(let j=0;j<4;j++){const bx=x+(j%2)*.3,bz=z+Math.floor(j/2)*.3;cyl('Bamboo stem',green,[bx,1.5,bz],[.06,3,.06]);for(let k=0;k<7;k++)cyl('Bamboo node',leafLight,[bx,.3+k*.4,bz],[.072,.035,.072]);}
      plant(x-.4,z-.3,2.4);
    }
    for(const z of [-3.8,3.7]) {box('Lantern foot',stone,[1.2,.25,z],[.4,.5,.4],true);round('Lantern glow',lamp,[1.2,.72,z],[.34,.42,.34]);box('Lantern cap',stone,[1.2,.99,z],[.65,.12,.65]);}
  }
  b.json.scenes[0].nodes.push(b.json.nodes.push({ name:'Arrival',translation:theme==='garden'?[-2.4,.2,3.5]:[0,.03,3.5],extensions:{OPENVROOM_components:{components:[{type:'spawn',yaw:Math.PI}]}}})-1);
  const bytes=b.finish(true);validateAsset(bytes,'room');await writeFile(`public/rooms/${theme}.vroom`,new Uint8Array(bytes));
  console.log(`${theme}: ${(bytes.byteLength/1024).toFixed(0)} KiB, ${b.json.materials.length} batched materials`);
}
