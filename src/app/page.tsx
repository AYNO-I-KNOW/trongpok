import TrongPok from '@/ui/trong-pok/components/TrongPok';
export default async function Page({searchParams}:{searchParams:Promise<{demo?:string;font?:string}>}){const params=await searchParams;return <TrongPok rankingDemo={params.demo==='ranking'} fontTheme={params.font==='line'?'line':'ibm'}/>}
