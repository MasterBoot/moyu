
export function createFeeding({ config, foods, Food, spawnRipple, rng }) {
/* 撒料的落点分布走独立随机流(与 food.js 同一条,由 app.js 注入)——
 * 不碰共享 Math.random,鱼的随机序列/同种子指纹不被投食扰动。 */
const R = rng || Math.random;
function feedAt(x, y) {
    if (config.enableFeeding) {
        // 一次撒一小把饲料,而不是一粒。
        // 这样几条鱼会各自锁定最近的一粒 —— 一撒下去就有一群围过来,而不是只有一条有份。

        const N = 20;                                      // 每次 20 粒
        const MAX_FOOD = 240;                              // 上限,防止狂点堆爆
        const startIdx = foods.length;                     // 只给"新撒的这批"做落水弹跳
        for (let i = 0; i < N && foods.length < MAX_FOOD; i++) {
            let a = R() * Math.PI * 2;
            let d = 8 + Math.pow(R(), 0.60) * 48; // 8~56px,中心稍密
            const fx = x + Math.cos(a) * d;
            const fy = y + Math.sin(a) * d * 0.85;
            foods.push(new Food(fx, fy));
        }
        for (let i = startIdx; i < foods.length; i++) {
            foods[i].pop = 0.4 + R() * 0.6;
        }
    }
    spawnRipple(x, y, 1.5 * config.rippleStrength);
}

return { feedAt };
}
