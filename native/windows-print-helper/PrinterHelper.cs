using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Linq;
using System.Drawing.Printing;

class PrinterHelper
{
    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFO pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBuf, int cbBuf, out int pcWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr hPrinter);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct DOCINFO
    {
        public int cbSize;
        public string pDocName;
        public string pOutputFile;
        public string pDatatype;
    }

    static int Main()
    {
        try
        {
            var requestJson = Console.In.ReadLine();
            if (string.IsNullOrEmpty(requestJson))
            {
                WriteError("no input");
                return 1;
            }

            using var doc = JsonDocument.Parse(requestJson);
            var root = doc.RootElement;

            if (!root.TryGetProperty("cmd", out var cmdProp))
            {
                WriteError("missing cmd");
                return 1;
            }

            var cmd = cmdProp.GetString();
            string response;

            switch (cmd)
            {
                case "list":
                    response = ListPrinters();
                    break;
                case "probe":
                    if (!root.TryGetProperty("devicePath", out var probePath))
                    {
                        WriteError("missing devicePath");
                        return 1;
                    }
                    response = ProbePrinter(probePath.GetString() ?? "");
                    break;
                case "print":
                    if (!root.TryGetProperty("devicePath", out var printPath) ||
                        !root.TryGetProperty("data", out var dataProp))
                    {
                        WriteError("missing devicePath or data");
                        return 1;
                    }
                    response = PrintRaw(printPath.GetString() ?? "", dataProp.GetString() ?? "");
                    break;
                default:
                    WriteError($"unknown cmd: {cmd}");
                    return 1;
            }

            Console.WriteLine(response);
            return 0;
        }
        catch (Exception ex)
        {
            WriteError(ex.Message);
            return 1;
        }
    }

    static string ListPrinters()
    {
        try
        {
            var names = new List<object>();
            foreach (string name in PrinterSettings.InstalledPrinters)
            {
                var ps = new PrinterSettings { PrinterName = name };
                names.Add(new
                {
                    name = name,
                    isDefault = ps.IsDefaultPrinter,
                    devicePath = name
                });
            }
            return JsonSerializer.Serialize(new { ok = true, printers = names });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { ok = false, error = ex.Message, code = "LIST_ERROR" });
        }
    }

    static string ProbePrinter(string devicePath)
    {
        try
        {
            if (!OpenPrinter(devicePath, out var hPrinter, IntPtr.Zero))
            {
                return JsonSerializer.Serialize(new { ok = true, reachable = false });
            }
            try
            {
                return JsonSerializer.Serialize(new
                {
                    ok = true,
                    reachable = true,
                    firmwareVersion = (string?)null,
                    serialNumber = (string?)null
                });
            }
            finally
            {
                ClosePrinter(hPrinter);
            }
        }
        catch
        {
            return JsonSerializer.Serialize(new { ok = true, reachable = false });
        }
    }

    static string PrintRaw(string devicePath, string base64Data)
    {
        IntPtr hPrinter = IntPtr.Zero;
        try
        {
            if (!OpenPrinter(devicePath, out hPrinter, IntPtr.Zero))
            {
                return JsonSerializer.Serialize(new
                {
                    ok = false,
                    error = "printer not found or inaccessible",
                    code = "PRINTER_NOT_FOUND"
                });
            }

            var docInfo = new DOCINFO
            {
                cbSize = 20,
                pDocName = "RAW Document",
                pOutputFile = null,
                pDatatype = "RAW"
            };

            if (!StartDocPrinter(hPrinter, 1, ref docInfo))
            {
                return JsonSerializer.Serialize(new
                {
                    ok = false,
                    error = "StartDocPrinter failed",
                    code = "SPOOLER_REJECTED"
                });
            }

            if (!StartPagePrinter(hPrinter))
            {
                EndDocPrinter(hPrinter);
                return JsonSerializer.Serialize(new
                {
                    ok = false,
                    error = "StartPagePrinter failed",
                    code = "SPOOLER_REJECTED"
                });
            }

            byte[] data;
            try
            {
                data = Convert.FromBase64String(base64Data);
            }
            catch
            {
                EndPagePrinter(hPrinter);
                EndDocPrinter(hPrinter);
                return JsonSerializer.Serialize(new
                {
                    ok = false,
                    error = "invalid base64 data",
                    code = "HELPER_INVALID_DATA"
                });
            }

            int written;
            var ptr = Marshal.AllocHGlobal(data.Length);
            try
            {
                Marshal.Copy(data, 0, ptr, data.Length);
                if (!WritePrinter(hPrinter, ptr, data.Length, out written))
                {
                    EndPagePrinter(hPrinter);
                    EndDocPrinter(hPrinter);
                    return JsonSerializer.Serialize(new
                    {
                        ok = false,
                        error = "WritePrinter failed",
                        code = "SPOOLER_REJECTED"
                    });
                }
            }
            finally
            {
                Marshal.FreeHGlobal(ptr);
            }

            if (!EndPagePrinter(hPrinter))
            {
                EndDocPrinter(hPrinter);
                return JsonSerializer.Serialize(new
                {
                    ok = false,
                    error = "EndPagePrinter failed",
                    code = "SPOOLER_REJECTED"
                });
            }

            if (!EndDocPrinter(hPrinter))
            {
                return JsonSerializer.Serialize(new
                {
                    ok = false,
                    error = "EndDocPrinter failed",
                    code = "SPOOLER_REJECTED"
                });
            }

            var spoolId = $"spool-{Guid.NewGuid():N}";
            return JsonSerializer.Serialize(new { ok = true, success = true, spoolerId = spoolId });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { ok = false, error = ex.Message, code = "PRINT_ERROR" });
        }
        finally
        {
            if (hPrinter != IntPtr.Zero)
                ClosePrinter(hPrinter);
        }
    }

    static void WriteError(string message)
    {
        Console.Error.WriteLine(message);
    }
}
