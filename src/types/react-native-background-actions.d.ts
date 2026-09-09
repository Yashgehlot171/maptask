declare module 'react-native-background-actions' {
  export type BackgroundTaskIcon = {
    name: string;
    type: string;
    package?: string;
  };

  export type BackgroundTaskOptions<T = unknown> = {
    taskName: string;
    taskTitle: string;
    taskDesc: string;
    taskIcon: BackgroundTaskIcon;
    color?: string;
    linkingURI?: string;
    parameters?: T;
    foregroundServiceType?: string[];
  };

  export type BackgroundTask<T = unknown> = (taskData?: T) => Promise<void>;

  interface BackgroundService {
    start<T = unknown>(task: BackgroundTask<T>, options: BackgroundTaskOptions<T>): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    updateNotification(taskData: Partial<BackgroundTaskOptions>): Promise<void>;
  }

  const backgroundService: BackgroundService;
  export default backgroundService;
}
