namespace ScreenLoop.Backend.Recorder
{
    internal class OBSWindow : Form
    {
        public OBSWindow()
        {
            // Hide the form
            ShowInTaskbar = false;
            FormBorderStyle = FormBorderStyle.None;
            Opacity = 0;

            // Initialize OBS utils asynchronously. InitializeAsync can throw before its own
            // error handling (for example if OBS is already initialized), and an escaping
            // exception from a fire-and-forget task would leave no trace in the log.
            Task.Run(async () =>
            {
                try
                {
                    await OBSService.InitializeAsync();
                }
                catch (Exception ex)
                {
                    Serilog.Log.Error(ex, "Recorder initialization failed");
                }
            });
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            Hide(); // Ensure the form is hidden on load
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= 0x80; // WS_EX_TOOLWINDOW to prevent from showing in Alt+Tab
                return cp;
            }
        }
    }
}
