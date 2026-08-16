package com.xiaz.financeplanner;

import android.os.Binder;
import android.os.IBinder;
import android.os.IInterface;
import android.os.Parcel;
import android.os.RemoteException;

/**
 * 手写 Binder 接口（等价于 AIDL 生成物）。
 *
 * 为什么不用 .aidl：项目路径含中文，AGP 的 AidlCompile 后处理在 JDK 21（默认 UTF-8）
 * 下读取 aidl.exe（GBK）输出的依赖文件会抛 MalformedInputException。
 * AIDL 只是代码生成器，此处手写等价 Stub/Proxy，事务码与 AIDL 版本一致。
 *
 * 事务码约定：
 * - 16777114：Shizuku server 保留的 destroy（服务进程退出）
 * - 1：exec(String cmd) → String，格式 "exitCode\n输出"
 */
public interface IExecService extends IInterface {

    String DESCRIPTOR = "com.xiaz.financeplanner.IExecService";

    int TRANSACTION_exec = 1;
    int TRANSACTION_destroy = 16777114; // Shizuku server reserved

    String exec(String cmd) throws RemoteException;

    void destroy();

    abstract class Stub extends Binder implements IExecService {

        public Stub() {
            attachInterface(this, DESCRIPTOR);
        }

        public static IExecService asInterface(IBinder obj) {
            if (obj == null) return null;
            IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
            if (iin instanceof IExecService) return (IExecService) iin;
            return new Proxy(obj);
        }

        @Override
        public IBinder asBinder() {
            return this;
        }

        @Override
        protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            if (code == INTERFACE_TRANSACTION) {
                reply.writeString(DESCRIPTOR);
                return true;
            }
            switch (code) {
                case TRANSACTION_exec: {
                    data.enforceInterface(DESCRIPTOR);
                    String cmd = data.readString();
                    String result;
                    try {
                        result = exec(cmd);
                    } catch (Exception e) {
                        // exec 实现内部已兜底，此处防御性兜底，避免服务进程崩溃
                        result = "-1\n" + e.getClass().getSimpleName() + ": " + e.getMessage();
                    }
                    reply.writeNoException();
                    reply.writeString(result);
                    return true;
                }
                case TRANSACTION_destroy: {
                    // Shizuku server 直接 transact，宽容处理（不 enforceInterface）
                    destroy();
                    return true;
                }
                default:
                    return super.onTransact(code, data, reply, flags);
            }
        }
    }

    /** 客户端代理（app 进程 → exec 服务进程，跨进程 binder 调用） */
    class Proxy implements IExecService {

        private final IBinder mRemote;

        Proxy(IBinder remote) {
            mRemote = remote;
        }

        @Override
        public IBinder asBinder() {
            return mRemote;
        }

        @Override
        public String exec(String cmd) throws RemoteException {
            Parcel data = Parcel.obtain();
            Parcel reply = Parcel.obtain();
            try {
                data.writeInterfaceToken(DESCRIPTOR);
                data.writeString(cmd);
                mRemote.transact(TRANSACTION_exec, data, reply, 0);
                reply.readException();
                return reply.readString();
            } finally {
                reply.recycle();
                data.recycle();
            }
        }

        @Override
        public void destroy() {
            // 客户端不主动调用 destroy（由 Shizuku server 触发），此处空实现
        }
    }
}
