from app.modules import energy, hardware, interconnect, orchestration, runtime

MODULE_ORDER = ["hardware", "interconnect", "runtime", "orchestration", "energy"]
MODULE_RUNNERS = {
    "hardware": hardware.run,
    "interconnect": interconnect.run,
    "runtime": runtime.run,
    "orchestration": orchestration.run,
    "energy": energy.run,
}
