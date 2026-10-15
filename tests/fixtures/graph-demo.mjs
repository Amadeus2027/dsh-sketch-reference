// Prepared editable demo scenes, not model output or fabricated screen captures.
const base={angle:0,strokeColor:'#343a40',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:17,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,version:1,versionNonce:1};
const rect=(id,x,y,width,height)=>({...base,id,type:'rectangle',x,y,width,height});
const text=(id,x,y,value,size=24)=>({...base,id,type:'text',x,y,width:Array.from(value).length*size,height:size*1.25,text:value,originalText:value,fontSize:size,fontFamily:1,textAlign:'left',verticalAlign:'top',containerId:null,lineHeight:1.25,autoResize:true});
const scene=elements=>({elements,appState:{viewBackgroundColor:'#ffffff'},files:{}});
export const demoScenes={
 root:{goal:'电商首页：顶部登录按钮进入登录页，商品卡片进入商品详情；Banner 的子草图只补充首页视觉细节，不是独立页面。',scene:scene([
  rect('home-frame',20,20,680,510),rect('home-nav',40,40,640,58),text('home-brand',58,54,'青禾商城',24),text('home-nav-links',260,58,'首页   精选   关于',18),rect('home-login',568,50,92,36),text('home-login-label',588,56,'登录',20),
  rect('home-banner',40,120,640,152),text('home-banner-title',76,150,'春季上新',36),text('home-banner-subtitle',78,205,'探索精选好物',20),
  rect('home-product',40,306,302,198),rect('home-product-image',58,322,266,100),text('home-product-title',62,438,'轻盈通勤包',24),text('home-product-price',62,474,'¥ 299',20),
  rect('home-product-two',376,306,302,198),rect('home-product-image-two',394,322,266,100),text('home-product-title-two',398,438,'日常随行杯',24),text('home-product-price-two',398,474,'¥ 89',20),
 ])},
 login:{goal:'独立登录页：手机号、密码、登录按钮和返回首页入口；登录成功后返回首页并显示已登录状态。',scene:scene([
  rect('login-frame',20,20,440,480),text('login-title',130,70,'欢迎回来',32),rect('login-phone',70,150,340,48),text('login-phone-label',88,163,'手机号',20),rect('login-password',70,224,340,48),text('login-password-label',88,237,'密码',20),rect('login-submit',70,312,340,48),text('login-submit-label',214,324,'登录',22),text('login-back',176,410,'返回首页',20),
 ])},
 product:{goal:'独立商品详情页：轻盈通勤包 ¥299，展示图片、说明、数量调整和加入购物车按钮；可返回首页。',scene:scene([
  rect('product-frame',20,20,570,450),text('product-back',42,42,'← 返回首页',20),rect('product-image',48,100,230,260),text('product-title',308,110,'轻盈通勤包',26),text('product-price',308,164,'¥ 299',26),text('product-desc',308,216,'轻便耐用 · 日常通勤',18),text('product-quantity',308,272,'数量   −  1  ＋',20),rect('product-cart',308,330,230,52),text('product-cart-label',350,345,'加入购物车',20),
 ])},
 banner:{goal:'这是首页 Banner 的局部视觉细节，不是独立页面：浅绿色背景、大标题“春季上新”、副标题“探索精选好物”、右侧简洁自然图形、“立即探索”按钮。',scene:scene([
  rect('banner-frame',20,20,660,270),text('banner-title',54,64,'春季上新',38),text('banner-subtitle',58,126,'探索精选好物',23),rect('banner-cta',58,192,168,52),text('banner-cta-label',88,207,'立即探索',22),rect('banner-art',420,58,212,190),text('banner-art-label',452,132,'自然图形',26),
 ])},
};
