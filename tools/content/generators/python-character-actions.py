import argparse, json
from pathlib import Path
import cv2
import numpy as np

COUNTS={"idle":10,"walk":8,"run":8,"attack":6,"slash":8,"hit":4,"weak":6,"stun":4,"death":10,"skillRaise":8}

def cutout(path):
    source=cv2.imread(str(path),cv2.IMREAD_UNCHANGED)
    if source is None: raise FileNotFoundError(path)
    if source.ndim==3 and source.shape[2]==4 and source[:,:,3].min()==0:
        return normalize(source)
    bgr=source[:,:,:3] if source.ndim==3 else cv2.cvtColor(source,cv2.COLOR_GRAY2BGR)
    h,w=bgr.shape[:2]
    mask=np.full((h,w),cv2.GC_PR_BGD,np.uint8); border=max(8,int(min(h,w)*.018))
    mask[:border,:]=mask[-border:,:]=mask[:,:border]=mask[:,-border:]=cv2.GC_BGD
    samples=np.concatenate([bgr[:80].reshape(-1,3),bgr[-80:].reshape(-1,3),bgr[:,:80].reshape(-1,3),bgr[:,-80:].reshape(-1,3)])
    background=np.median(samples,axis=0)
    distance=np.linalg.norm(bgr.astype(np.float32)-background,axis=2)
    yy,xx=np.ogrid[:h,:w]
    center=(xx>w*.04)&(xx<w*.96)&(yy>h*.015)&(yy<h*.99)
    # 中心区域一律作为可能前景，禁止把浅色皮肤、白发和衣纹按背景色直接清除。
    mask[center]=cv2.GC_PR_FGD
    outer=(xx<w*.12)|(xx>w*.88)|(yy<h*.08)|(yy>h*.97)
    mask[(distance<20)&outer]=cv2.GC_BGD
    mask[(distance>48)&center]=cv2.GC_PR_FGD
    bg=np.zeros((1,65),np.float64); fg=np.zeros((1,65),np.float64)
    cv2.grabCut(bgr,mask,None,bg,fg,7,cv2.GC_INIT_WITH_MASK)
    alpha=np.where((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    alpha=cv2.morphologyEx(alpha,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8),iterations=1)
    n,labels,stats,centers=cv2.connectedComponentsWithStats((alpha>0).astype(np.uint8),8)
    keep=np.zeros_like(alpha)
    if n>1:
        main=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA])); keep[labels==main]=255
        for c in range(1,n):
            if c==main: continue
            area=stats[c,cv2.CC_STAT_AREA]; cw=stats[c,cv2.CC_STAT_WIDTH]; ch=stats[c,cv2.CC_STAT_HEIGHT]; cy=centers[c][1]
            if area>=max(45,h*w*.00012) and not (cy>h*.82 and cw>ch*3.2): keep[labels==c]=255
    alpha=cv2.GaussianBlur(keep,(0,0),.55); alpha[alpha<6]=0; alpha[alpha>249]=255
    rgba=cv2.cvtColor(bgr,cv2.COLOR_BGR2BGRA); rgba[:,:,3]=alpha
    return normalize(rgba)

def normalize(rgba):
    ys,xs=np.where(rgba[:,:,3]>8)
    if len(xs)==0: raise ValueError('empty alpha')
    x0,x1=max(0,xs.min()-4),min(rgba.shape[1],xs.max()+5); y0,y1=max(0,ys.min()-4),min(rgba.shape[0],ys.max()+5)
    crop=rgba[y0:y1,x0:x1]; ch,cw=crop.shape[:2]
    scale=min(236/cw,368/ch); nw,nh=max(1,int(cw*scale)),max(1,int(ch*scale))
    prem=crop[:,:,:3].astype(np.float32)*(crop[:,:,3:4].astype(np.float32)/255)
    rp=cv2.resize(prem,(nw,nh),interpolation=cv2.INTER_LANCZOS4); ra=np.clip(cv2.resize(crop[:,:,3],(nw,nh),interpolation=cv2.INTER_LANCZOS4),0,255)
    rgb=np.clip(rp/np.maximum(ra[:,:,None]/255,1e-5),0,255)
    resized=np.dstack([rgb,ra]).astype(np.uint8); out=np.zeros((384,256,4),np.uint8)
    x=(256-nw)//2; y=380-nh; out[y:y+nh,x:x+nw]=resized
    return out

def transform(img,angle=0,dx=0,dy=0,scale=1):
    m=cv2.getRotationMatrix2D((128,374),angle,scale); m[:,2]+=(dx,dy)
    return cv2.warpAffine(img,m,(256,384),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_CONSTANT,borderValue=(0,0,0,0))

def transform_center(img,angle=0,dx=0,dy=0,scale=1):
    m=cv2.getRotationMatrix2D((128,192),angle,scale); m[:,2]+=(dx,dy)
    return cv2.warpAffine(img,m,(256,384),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_CONSTANT,borderValue=(0,0,0,0))


def alpha_over(foreground,background):
    fa=foreground[:,:,3:4].astype(np.float32)/255; ba=background[:,:,3:4].astype(np.float32)/255
    oa=fa+ba*(1-fa); rgb=(foreground[:,:,:3].astype(np.float32)*fa+background[:,:,:3].astype(np.float32)*ba*(1-fa))/np.maximum(oa,1e-5)
    return np.dstack([np.clip(rgb,0,255),np.clip(oa[:,:,0]*255,0,255)]).astype(np.uint8)


def overlay_golden_hammer_left(img):
    weapon=np.zeros_like(img); outline=(18,46,72,255); gold=(43,158,221,255); light=(102,222,255,255); dark=(20,91,145,255); green=(61,126,51,255)
    cv2.rectangle(weapon,(152,56),(255,112),outline,-1,cv2.LINE_AA);cv2.rectangle(weapon,(157,61),(252,107),gold,-1,cv2.LINE_AA)
    cv2.fillPoly(weapon,[np.array([(157,72),(175,64),(175,104),(157,96)])],dark,cv2.LINE_AA);cv2.fillPoly(weapon,[np.array([(252,72),(234,64),(234,104),(252,96)])],light,cv2.LINE_AA)
    cv2.line(weapon,(213,105),(238,372),outline,16,cv2.LINE_AA);cv2.line(weapon,(215,108),(234,368),gold,7,cv2.LINE_AA)
    cv2.rectangle(weapon,(198,60),(215,108),outline,-1,cv2.LINE_AA);cv2.rectangle(weapon,(202,63),(211,105),dark,-1,cv2.LINE_AA)
    # 角色左手位于画面右侧，手掌覆盖锤柄形成明确握持关系。
    cv2.ellipse(weapon,(221,208),(11,14),-12,0,360,(194,220,248,255),-1,cv2.LINE_AA)
    return alpha_over(weapon,img)


def save(path,img):
    if not cv2.imwrite(str(path),img): raise IOError(path)

def main():
    p=argparse.ArgumentParser(); p.add_argument('--out-dir',required=True); p.add_argument('--character',required=True); p.add_argument('--reference',required=True); p.add_argument('--raw-manifest',required=True); p.add_argument('--weapon-overlay',default=''); a=p.parse_args()
    out=Path(a.out_dir); out.mkdir(parents=True,exist_ok=True)
    records=json.loads(Path(a.raw_manifest).read_text(encoding='utf-8'))
    raw={(r['character'],r['action'],int(r['index'])):Path(r['raw']) for r in records}
    idle=cutout(a.reference)
    if a.weapon_overlay=='golden-hammer-left': idle=overlay_golden_hammer_left(idle)
    generated={}
    bounce=[0,-1,-2,-1,0,1,0,-1,0,0]
    generated['idle']=[transform(idle,dy=v) for v in bounce]
    for action,count in [('walk',8),('attack',6),('hit',4),('skill_raise',8)]:
        generated[action]=[cutout(raw[(a.character,action,i)]) for i in range(count)]
        if a.weapon_overlay=='golden-hammer-left': generated[action]=[overlay_golden_hammer_left(img) for img in generated[action]]
    generated['run']=[transform(img,dx=(-2 if i%2==0 else 2),dy=-2,scale=1.02) for i,img in enumerate(generated['walk'])]
    generated['slash']=[transform(generated['attack'][round(i*5/7)],angle=(-3+6*i/7),dx=int(-2+4*i/7)) for i in range(8)]
    generated['weak']=[transform(idle,angle=4,dy=7+abs(2-i),scale=.97) for i in range(6)]
    generated['stun']=[transform(idle,angle=[-3,0,3,0][i],dx=[-3,0,3,0][i]) for i in range(4)]
    generated['death']=[transform_center(idle,angle=82*i/9,dy=18*i/9,scale=1-.36*i/9) for i in range(10)]
    generated['skillRaise']=generated.pop('skill_raise')
    for action,count in COUNTS.items():
        file_action='skill_raise' if action=='skillRaise' else action
        for i,img in enumerate(generated[action]): save(out/f'{a.character}_ai_{file_action}_{i:02d}.png',img)

if __name__=='__main__': main()
