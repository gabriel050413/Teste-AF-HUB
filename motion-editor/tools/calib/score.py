import numpy as np, sys
from PIL import Image
import os; D=os.environ.get('CALIB_DIR','./')
for pair in sys.argv[1:]:
    mf,ae=pair.split(':')
    a=np.asarray(Image.open(D+f'mf_{mf}.png').convert('RGB')).astype(float); b=np.asarray(Image.open(D+f'{ae}_sq.png').convert('RGB')).astype(float)
    m=np.load(D+f'{ae}_mask.npy')
    d=np.abs(a-b)[m]; mean=d.mean()
    ma=a[m].mean(0); mb=b[m].mean(0)
    la=(a[m]@[.299,.587,.114]); lb=(b[m]@[.299,.587,.114])
    print(f'{mf:8} vs {ae:7} err {mean:5.1f} | mean MF {ma.round(0)} AE {mb.round(0)} | luma p10/50/90 MF {np.percentile(la,[10,50,90]).round(0)} AE {np.percentile(lb,[10,50,90]).round(0)}')
