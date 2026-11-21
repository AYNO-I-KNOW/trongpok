import type {Evaluation} from './types';
export function hasRecommendationRank(item:Evaluation):boolean{return item.verdict==='pass'&&Number.isInteger(item.rank)&&item.rank!>=1&&item.rank!<=3}
export function orderForComparison(items:Evaluation[]):Evaluation[]{return [...items].sort((a,b)=>(hasRecommendationRank(a)?a.rank!:Infinity)-(hasRecommendationRank(b)?b.rank!:Infinity))}
