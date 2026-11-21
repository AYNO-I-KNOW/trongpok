export const PRICE_SNAPSHOT_DATE='20 พ.ย. 2569';
import type {Product,ProductId} from './types';
export const SIMPLUS_URL='https://shopee.co.th/product/498791076/12781309334';
export const products:Record<ProductId,Product>={
 electrolux:{id:'electrolux',name:'Electrolux E3CB1-630S',option:'ขวด 600 มล. / โถบด',image:'/assets/electrolux-official.png',price:1690,priceText:'฿1,690 · อ้างอิง 20 พ.ย. 2569',store:'Electrolux Thailand',storeUrl:'https://www.electrolux.co.th/appliances/blenders-juicers/e3cb1-630s/',manualUrl:'https://www.electrolux.co.th/globalassets/user-manual/e-e3cb1-630s-um.pdf#page=13'},
 simplus:{id:'simplus',name:'Simplus DDJR003',option:'2 ลิตร · รูปตัวเลือกโถแก้ว',image:'/assets/simplusPhoto.jpg',price:null,priceText:'฿659–689 ตามตัวเลือก · ราคาที่บันทึกไว้',store:'Simplus Electric',storeUrl:SIMPLUS_URL,manualUrl:'https://pc.simplus.online/th/pages/user-manual-ddjr003'},
 'electrolux-large':{id:'electrolux-large',name:'Electrolux E5TB1-710K',option:'โถแก้ว 1.75 ลิตร',manualUrl:'https://www.electrolux.co.th/globalassets/appliances/blender/e5tb1-710k/e5tb1-710k-um.pdf#page=14',image:'/assets/electrolux-large.png',price:2490,priceText:'฿2,490 · ราคาอ้างอิง',store:'Electrolux Thailand',storeUrl:'https://www.electrolux.co.th/appliances/blenders-juicers/e5tb1-710k/'},
 hoffen:{id:'hoffen',name:'HOFFEN FB-3025',option:'ขวด 600 มล. · 350W',image:'/assets/hoffenPhoto.png',price:null,priceText:'ยังไม่ยืนยันราคา',store:'ยังไม่ยืนยันร้านในไทย',manualUrl:'https://hoffen.com.pl/wp-content/uploads/2023/01/IM_POJM230025-BLENDER-Z-BIDONEM_rev8.pdf#page=20'}
};
export const mockProducts:Product[]=[
 {id:'mock-mini',name:'Buddy Mini M1',option:'6 ก้อนต่อรอบ',price:1290,priceText:'฿1,290 · สมมติ',store:'ร้านสมมติ A',mock:true,capacity:6},
 {id:'mock-flex',name:'Buddy Flex M2',option:'8 ก้อนต่อรอบ',price:1690,priceText:'฿1,690 · สมมติ',store:'ร้านสมมติ B',mock:true,capacity:8},
 {id:'mock-max',name:'Buddy Max M3',option:'12 ก้อนต่อรอบ',price:2190,priceText:'฿2,190 · สมมติ',store:'ร้านสมมติ C',mock:true,capacity:12}
];
