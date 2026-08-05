"""Run a simple_crazyflie script against the custom CRTP v6 firmware."""
import json
import runpy
import sys
from pathlib import Path
from threading import Event, Timer
from time import sleep

import cflib.crtp
from cflib.crtp.crtpstack import CRTPPort
from cflib.crazyflie import Crazyflie
from cflib.crazyflie.log import LogTocElement
from cflib.crazyflie.param import ParamTocElement
from cflib.crazyflie.syncCrazyflie import SyncCrazyflie
from cflib.crazyflie.toc import Toc, TocFetcher

TOC_STAGE_DELAY = 0.5  # Firmware needs time between cached TOC stages.
SETUP_TIMEOUT = 20.0
_close_link = Crazyflie.close_link


def _fetch_param_toc(cf, done):
    cache_dir = Path(cf._toc_cache._rw_cache or '')
    for path in cache_dir.glob('*.json'):
        try:
            toc = json.loads(
                path.read_text(), object_hook=cf._toc_cache._decoder)
            arm = toc.get('system', {}).get('arm')
            if isinstance(arm, ParamTocElement):
                cf.param.toc.toc = toc
                cf.param._useV2 = True
                done()
                return
        except (OSError, ValueError):
            pass

    print('CRTP v6: Log TOC ready; fetching Param TOC ...', flush=True)
    Timer(
        TOC_STAGE_DELAY,
        lambda: cf.param.refresh_toc(
            done, cf._toc_cache),
    ).start()


def _crtp_v6_setup(self):
    """Fetch only the TOCs used by these scripts.

    This firmware stops answering after a same-connection logging reset and
    has an incompatible memory service, so skip reset and memory enumeration.
    """
    self.platform._protocolVersion = 6
    self.log._useV2 = True
    self.log._config_id_counter = 1
    self.log.toc = Toc()

    def timeout():
        self.connection_failed.call(
            self.link_uri, 'CRTP v6 TOC setup timed out')

    setup_timeout = Timer(SETUP_TIMEOUT, timeout)
    setup_timeout.daemon = True
    setup_timeout.start()

    def done():
        setup_timeout.cancel()
        print('CRTP v6: TOCs ready.', flush=True)
        self._param_toc_updated_cb()

    print('CRTP v6: fetching Log TOC ...', flush=True)
    TocFetcher(
        self,
        LogTocElement,
        CRTPPort.LOGGING,
        self.log.toc,
        lambda: _fetch_param_toc(self, done),
        self._toc_cache,
    ).start()


def _reset_logging(uri):
    reset_done = Event()
    print('CRTP v6: resetting stale log blocks ...', flush=True)
    with SyncCrazyflie(uri, cf=Crazyflie(rw_cache='./cache')) as scf:
        scf.cf.packet_received.add_callback(
            lambda packet: reset_done.set()
            if packet.port == CRTPPort.LOGGING
            and packet.channel == 1
            and packet.data
            and packet.data[0] == 5 else None)
        scf.cf.log.reset()
        if not reset_done.wait(2):
            raise TimeoutError('CRTP v6 logging reset timed out')


def _crtp_v6_close(self):
    for config in self.log.log_blocks:
        config.stop()
        config.delete()
    if self.log.log_blocks:
        sleep(0.2)
    _close_link(self)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(f'Usage: {sys.argv[0]} SCRIPT.py')

    script = sys.argv[1]
    uri = runpy.run_path(script, run_name='_crtp_v6_config').get('URI')
    if not uri:
        raise SystemExit(f'{script} does not define URI')

    Crazyflie._start_connection_setup = _crtp_v6_setup
    cflib.crtp.init_drivers()
    _reset_logging(uri)
    Crazyflie.close_link = _crtp_v6_close
    runpy.run_path(script, run_name='__main__')
