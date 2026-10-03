/* globalThis.KoiShared 注入 —— theme.js / koishape.js / watergl.js 在页面里是
 * 经典 <script>(顶层 const 进入全局词法环境),Node 里没有这层;src/ 里的模块
 * 都从 legacy-assets.js 解构 globalThis.KoiShared。测试在被测模块 import 之前
 * 调 installKoiShared() 放一份最小 stub(纯函数测试用不到真实值)。 */
export function installKoiShared() {
    globalThis.KoiShared = {
        THEME: {
            water: {
                tint: '#0a1f20',
                ripple: {
                    maxLive: 16, life: [1, 1], speed: [30, 30], lamRatio: 0.25,
                    ridgeFrac: 0.2, flankFrac: 0.13, flankOffset: 0.34,
                    crest: 'rgba(255,255,255,', trough: 'rgba(0,0,0,',
                    crestAlpha: 0.5, troughAlpha: 0.3, fadePower: 1.2, spread: 60,
                    lightDistDim: 0.4, arcPower: 1.5, arcJitter: 0.2, arcStops: 12,
                    crests: 1, ridgeAmp: 1, flankAmp: 1
                }
            },
            light: { dir: [-0.7071, -0.7071] },
            weather: {
                order: ['clear', 'rain', 'snow'],
                transition: 1, rainFade: 1,
                clear: { causticAlpha: 1, grade: '#ffffff', gradeAlpha: 0, rain: null },
                rain: {
                    causticAlpha: 0.3, grade: '#95a4ac', gradeAlpha: 0.7,
                    rain: { power: [0.1, 0.2], maxLive: 50, streak: { perSec: 100 } }
                },
                snow: { causticAlpha: 0.5, grade: '#b9c7ce', gradeAlpha: 0.4, rain: null, snow: { perSec: 50 } }
            }
        },
        KOI_SHAPE: {},
        WaterGL: { dispose() {} }
    };
}
