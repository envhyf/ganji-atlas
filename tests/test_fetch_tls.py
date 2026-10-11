import sys
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
import fetch
import requests


class FetchTLSTests(unittest.TestCase):
    def setUp(self):
        fetch._use_origin_tls = False

    def tearDown(self):
        fetch._use_origin_tls = False

    def test_alternate_sni_keeps_www_certificate_validation(self):
        self.assertEqual(fetch._origin.assert_hostname, 'www.xuribiao.com')
        self.assertEqual(fetch._origin.cert_reqs, 'CERT_REQUIRED')
        self.assertTrue(fetch._origin.ca_certs)
        response = Mock(status=200, data='四川赶场'.encode('utf-8'))
        with patch.object(fetch._session, 'get', side_effect=requests.exceptions.SSLError()), patch.object(fetch._origin, 'request', return_value=response) as origin:
            self.assertEqual(fetch._download(fetch.BASE + '/ganji/zhen/7585.html'), '四川赶场')
            self.assertEqual(origin.call_args.kwargs['headers']['Host'], 'www.xuribiao.com')
            self.assertFalse(origin.call_args.kwargs['redirect'])

    def test_other_hosts_never_use_this_fallback(self):
        with patch.object(fetch._session, 'get', side_effect=requests.exceptions.SSLError()), patch.object(fetch._origin, 'request') as origin:
            with self.assertRaises(requests.exceptions.SSLError):
                fetch._download('https://example.com/')
            origin.assert_not_called()

    def test_bad_origin_certificate_is_not_accepted(self):
        with patch.object(fetch._session, 'get', side_effect=requests.exceptions.SSLError()), patch.object(fetch._origin, 'request', side_effect=fetch.urllib3.exceptions.SSLError('bad certificate')):
            with self.assertRaises(fetch.urllib3.exceptions.SSLError):
                fetch._download(fetch.BASE + '/ganji/zhen/7585.html')
        self.assertFalse(fetch._use_origin_tls)
