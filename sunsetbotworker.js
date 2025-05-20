/**
 * Cloudflare Worker  —  sunrise / sunset notifier
 * 转换自原 Python 脚本
 * 注意：若要隐藏密钥，请在 Dashboard → Settings → Environment Variables
 *       添加一个名称为 SEND_KEY 的“secret”环境变量，然后改用 env.SEND_KEY。
 */

export default {
  async fetch(request, env, ctx) {
    /* ===== 0)   头部认证 ===== */
    const HEADER_NAME   = 'X-Token';          // 你要求客户端必须携带的请求头
    const EXPECTED_TOKEN = env?.API_TOKEN; // 期望值

    const clientToken = request.headers.get(HEADER_NAME);
    if (clientToken !== EXPECTED_TOKEN) {
      // 没带头或值错误 → 拒绝
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    // 若 URL 中有 ?city=... 则取其值，否则默认“陕西省-西安”
    // decodeURIComponent 可将 URL 编码的中文参数转回汉字
    const CITY = decodeURIComponent(
      searchParams.get('city') ?? '陕西省-西安',
    );

    // 1) 判断北京时间的小时数
    const beijingHour = Number(
      new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Shanghai',
        hourCycle: 'h23',
        hour: 'numeric',
      }),
    );

    const riseOrSet = beijingHour >= 0 && beijingHour < 5 ? 'rise_1' : 'set_1';

    // 2) 目标城市 & 查询参数
    const query = new URLSearchParams({
      query_id: String(Math.floor(Math.random() * 10_000_000) + 1),
      intend: 'select_city',
      query_city: CITY,
      event_date: 'None',
      event: riseOrSet,
      times: 'None',
    });

    // 3) 调 sunsetbot.top
    const sunResp = await fetch(`https://sunsetbot.top/?${query}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Cloudflare-Workers/2025.05; +https://workers.cloudflare.com/)',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (!sunResp.ok) {
      return new Response(
        `sunsetbot.top 返回错误：${sunResp.status}`,
        { status: 502 },
      );
    }

    const data = await sunResp.json();

    // 4) 组装推送内容
    const title = encodeURIComponent(
      data.place_holder +
        (riseOrSet === 'rise_1' ? '日出' : '日落') +
        data.tb_quality.replace(/<br>/g, ''),
    );

    const desp = encodeURIComponent(
      `**北京时间** ${data.tb_event_time.replace(/<br>/g, ' ')}\n\n` +
        `**预报火烧云鲜艳度** ${data.tb_quality.replace(/<br>/g, '')}\n\n` +
        `**预报气溶胶** ${data.tb_aod.replace(/<br>/g, '')}`,
    );

    // 5) Server 酱推送（无需等待结果，失败也不影响主流程）
    const SEND_KEY = env?.SEND_KEY; // ←改成你的 key
    const pushUrl = `https://sctapi.ftqq.com/${SEND_KEY}.s1end?title=${title}&desp=${desp}&noip=1`;

    ctx.waitUntil(fetch(pushUrl).catch(() => {}));

    // 6) 把 sunsetbot 的原始数据返回，方便调试
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  },
};
