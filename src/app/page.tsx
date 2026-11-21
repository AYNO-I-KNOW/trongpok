import BuyBuddy from '@/ui/buy-buddy/components/BuyBuddy';
export default async function Page({searchParams}:{searchParams:Promise<{demo?:string;font?:string}>}){const params=await searchParams;return <BuyBuddy rankingDemo={params.demo==='ranking'} fontTheme={params.font==='line'?'line':'ibm'}/>}
