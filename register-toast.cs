using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class RegisterToast
{
    private static readonly Guid AppUserModelIdKey = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink { }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder file, int max, IntPtr data, uint flags);
        void GetIDList(out IntPtr idList); void SetIDList(IntPtr idList);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder text, int max);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder directory, int max);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder args, int max);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
        void GetHotkey(out short hotkey); void SetHotkey(short hotkey);
        void GetShowCmd(out int showCmd); void SetShowCmd(int showCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder icon, int max, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string icon, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr hwnd, uint flags); void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }

    [ComImport, Guid("0000010B-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPersistFile { void GetClassID(out Guid id); void IsDirty(); void Load([MarshalAs(UnmanagedType.LPWStr)] string file, uint mode); void Save([MarshalAs(UnmanagedType.LPWStr)] string file, bool remember); void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string file); void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string file); }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore { void GetCount(out uint count); void GetAt(uint index, out PropertyKey key); void GetValue(ref PropertyKey key, out PropVariant value); void SetValue(ref PropertyKey key, ref PropVariant value); void Commit(); }

    [StructLayout(LayoutKind.Sequential, Pack = 4)] private struct PropertyKey { public Guid FormatId; public uint PropertyId; public PropertyKey(Guid formatId, uint propertyId) { FormatId = formatId; PropertyId = propertyId; } }
    [StructLayout(LayoutKind.Explicit)] private struct PropVariant { [FieldOffset(0)] public ushort VariantType; [FieldOffset(8)] public IntPtr Pointer; }

    public static int Main(string[] args)
    {
        if (args.Length != 4) return 2;
        var shortcut = args[0]; var target = args[1]; var workingDirectory = args[2]; var appId = args[3];
        Directory.CreateDirectory(Path.GetDirectoryName(shortcut));
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(target); link.SetWorkingDirectory(workingDirectory); link.SetArguments("camera-server.js"); link.SetDescription("人脸守望"); link.SetIconLocation(target, 0);
        var store = (IPropertyStore)link;
        var key = new PropertyKey(AppUserModelIdKey, 5);
        var value = new PropVariant { VariantType = 31, Pointer = Marshal.StringToCoTaskMemUni(appId) };
        store.SetValue(ref key, ref value); store.Commit();
        ((IPersistFile)link).Save(shortcut, true);
        Marshal.FreeCoTaskMem(value.Pointer);
        return File.Exists(shortcut) ? 0 : 1;
    }
}
