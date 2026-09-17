/**
 * 本机 GPU 显存快照，供管理台的模型管理页在"加载"之前展示。
 *
 * 为什么需要它：这块 3090 是**多个项目共用**的。只看 Ollama 自己的 `/api/ps`
 * 会得到一个危险的错觉——"显存还空着"，于是管理员点下"加载 qwen3:14b"，
 * 把隔壁正在跑的评测任务挤掉，或者自己因为显存不足永远加载不完。
 * nvidia-smi 能看到全部占用者，包括不是 Ollama 的那些进程。
 *
 * 拿不到就返回空数组，**不是错误**：非 NVIDIA 机器、没装驱动、容器里没映射设备
 * 都会走到这里，界面显示"读不到"即可，不该让整个状态接口 500。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT_MS = 3000;

/** 单行 CSV → 数组。nvidia-smi 的值里可能带空格（显卡名），所以按逗号切再 trim */
function csv(line) {
  return line.split(',').map((s) => s.trim());
}

/**
 * @returns {Promise<{gpus:Array, processes:Array, error:string}>}
 */
export async function gpuSnapshot() {
  const result = { gpus: [], processes: [], error: '' };

  try {
    const { stdout } = await run('nvidia-smi', [
      '--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu',
      '--format=csv,noheader,nounits'
    ], { timeout: TIMEOUT_MS });

    result.gpus = stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [index, name, total, used, free, util] = csv(line);
      return {
        index: Number(index),
        name,
        totalMb: Number(total),
        usedMb: Number(used),
        freeMb: Number(free),
        utilization: Number(util)
      };
    });
  } catch (e) {
    result.error = e.code === 'ENOENT' ? 'nvidia-smi 不可用' : (e.message || '读取显存失败');
    return result;
  }

  // 占用者清单单独一次查询：有些驱动/容器里这条会失败，失败了也不影响上面的总量
  try {
    const { stdout } = await run('nvidia-smi', [
      '--query-compute-apps=pid,process_name,used_memory',
      '--format=csv,noheader,nounits'
    ], { timeout: TIMEOUT_MS });

    result.processes = stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [pid, name, usedMb] = csv(line);
      return { pid: Number(pid), name, usedMb: Number(usedMb) };
    }).filter((p) => Number.isFinite(p.usedMb));
  } catch {
    /* 拿不到占用者清单就只显示总量 */
  }

  return result;
}
