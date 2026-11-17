import numpy as np
from PIL import Image
def gray(im): return np.asarray(im.convert('L')).astype(float)
def grad(a):
    gx=np.zeros_like(a); gy=np.zeros_like(a); gx[:,1:]=a[:,1:]-a[:,:-1]; gy[1:]=a[1:]-a[:-1]; return np.hypot(gx,gy)
O=Image.open('orig.png').convert('RGB')
boxes={'wdzik':(106,73),'ftb':(103,73),'rafa':(131,29),'galego':(103,60)}
res={}
for k,(x,y) in boxes.items():
    T=Image.open(f'{k}_sq.png').convert('RGB')
    t=grad(gray(T.resize((128,128))))
    best=None
    for s in np.arange(0.80,1.30,0.02):
        # região do orig correspondente: o quadrado do orig (420px) escalado por s, deslocado
        sz=420/s
        for dx in range(-80,81,8):
            for dy in range(-80,81,8):
                x0=64+dx+(420-sz)/2; y0=15+dy+(420-sz)/2
                c=O.crop((x0,y0,x0+sz,y0+sz)).resize((128,128))
                g=grad(gray(c))
                # região válida: dentro do orig
                v=np.ones((128,128),bool)
                sc=sz/128
                xs=x0+np.arange(128)*sc; ys=y0+np.arange(128)*sc
                v&=((xs>=64)&(xs<484))[None,:]; v&=((ys>=15)&(ys<435))[:,None]
                if v.mean()<0.5: continue
                a=g[v]-g[v].mean(); b=t[v]-t[v].mean()
                r=(a*b).sum()/np.sqrt((a*a).sum()*(b*b).sum()+1e-9)
                if best is None or r>best[0]: best=(r,s,dx,dy)
    r,s,dx,dy=best
    # refino
    for s2 in np.arange(s-0.02,s+0.021,0.005):
        sz=420/s2
        for dx2 in range(dx-8,dx+9,2):
            for dy2 in range(dy-8,dy+9,2):
                x0=64+dx2+(420-sz)/2; y0=15+dy2+(420-sz)/2
                c=O.crop((x0,y0,x0+sz,y0+sz)).resize((128,128)); g=grad(gray(c))
                sc=sz/128; xs=x0+np.arange(128)*sc; ys=y0+np.arange(128)*sc
                v=((xs>=64)&(xs<484))[None,:]&((ys>=15)&(ys<435))[:,None]
                a=g[v]-g[v].mean(); b=t[v]-t[v].mean(); rr=(a*b).sum()/np.sqrt((a*a).sum()*(b*b).sum()+1e-9)
                if rr>best[0]: best=(rr,s2,dx2,dy2)
    res[k]=best; print(k, [round(float(v),3) for v in best])
    r,s,dx,dy=best; sz=420/s; x0=64+dx+(420-sz)/2; y0=15+dy+(420-sz)/2
    O.crop((x0,y0,x0+sz,y0+sz)).resize((512,512),Image.LANCZOS).save(f'in_{k}.png')
    xs=x0+np.arange(512)*sz/512; ys=y0+np.arange(512)*sz/512
    v=((xs>=66)&(xs<482))[None,:]&((ys>=17)&(ys<433))[:,None]
    m=np.load(f'{k}_mask.npy')&v; np.save(f'{k}_mask.npy',m)
