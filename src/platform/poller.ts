/**
 * 轮询式变更监听。
 *
 * 显示器布局与皮肤目录都没有系统级变更事件，只能定时读取并比较指纹。
 * 首次读取只建立基准，之后仅在上报指纹变化时通知一次；
 * 读取失败沿用上一次的基准，不打断后续轮询。
 */

export interface PollForChangesOptions<T> {
  read: () => Promise<T>;
  /** 把一次读数折叠成可比较的指纹。 */
  signature: (value: T) => string;
  onChange: (value: T) => Promise<void> | void;
  intervalMs?: number;
  onError?: (error: unknown) => void;
  /** 错误日志里用来标识轮询目标的中文名称。 */
  label?: string;
}

/** 开始轮询，返回停止函数。 */
export function pollForChanges<T>(options: PollForChangesOptions<T>): () => void {
  const intervalMs = options.intervalMs ?? 2000;
  const label = options.label ?? '目标';
  const onError =
    options.onError ?? ((error: unknown) => console.warn(`[poller] 轮询${label}失败`, error));

  let signature: string | null = null;
  let running = false;
  let stopped = false;

  const check = async (): Promise<void> => {
    if (running || stopped) {
      return;
    }
    running = true;
    try {
      const value = await options.read();
      const next = options.signature(value);
      if (signature === null) {
        signature = next;
        return;
      }
      if (next !== signature) {
        signature = next;
        await options.onChange(value);
      }
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };

  void check();
  const timer = setInterval(() => {
    void check();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
