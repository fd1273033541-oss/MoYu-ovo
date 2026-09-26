using System;
using System.Reflection;
using System.Runtime.InteropServices;

internal static class ToastSender
{
    [DllImport("shell32.dll")]
    private static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appId);

    private static Type RuntimeType(string name)
    {
        return Type.GetType(name + ", Windows, ContentType=WindowsRuntime", true);
    }

    public static int Main(string[] args)
    {
        if (args.Length != 3) return 2;
        try
        {
            var appId = args[0];
            SetCurrentProcessExplicitAppUserModelID(appId);

            var xmlType = RuntimeType("Windows.Data.Xml.Dom.XmlDocument");
            var xml = Activator.CreateInstance(xmlType);
            var escape = new Func<string, string>(value => System.Security.SecurityElement.Escape(value) ?? "");
            var markup = "<toast><visual><binding template='ToastGeneric'><text>" + escape(args[1]) + "</text><text>" + escape(args[2]) + "</text></binding></visual></toast>";
            xmlType.GetMethod("LoadXml", new[] { typeof(string) }).Invoke(xml, new object[] { markup });

            var toastType = RuntimeType("Windows.UI.Notifications.ToastNotification");
            var toast = Activator.CreateInstance(toastType, new[] { xml });
            var managerType = RuntimeType("Windows.UI.Notifications.ToastNotificationManager");
            var notifier = managerType.GetMethod("CreateToastNotifier", new[] { typeof(string) }).Invoke(null, new object[] { appId });
            notifier.GetType().GetMethod("Show").Invoke(notifier, new[] { toast });
            return 0;
        }
        catch (TargetInvocationException error)
        {
            Console.Error.WriteLine(error.InnerException != null ? error.InnerException.Message : error.Message);
            return 1;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}
