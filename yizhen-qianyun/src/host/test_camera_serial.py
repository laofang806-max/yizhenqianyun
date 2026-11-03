import ctypes
import unittest
from unittest.mock import patch
from host.camera_bridge import D2xxDevice

class Function:
 def __init__(self, name, calls): self.name,self.calls=name,calls
 def __call__(self,*args):
  self.calls.append((self.name,args))
  if self.name=='FT_OpenEx':
   self.calls.append(('SERIAL',ctypes.string_at(args[0])))
   ctypes.cast(args[2],ctypes.POINTER(ctypes.c_void_p)).contents.value=1
  if self.name=='FT_Write':
   ctypes.cast(args[3],ctypes.POINTER(ctypes.c_ulong)).contents.value=args[2]
  if self.name=='FT_Open':
   ctypes.cast(args[1],ctypes.POINTER(ctypes.c_void_p)).contents.value=1
  return 0
class Library:
 def __init__(self,calls): self.calls=calls
 def __getattr__(self,name):
  f=Function(name,self.calls);setattr(self,name,f);return f
class SerialSelectionTests(unittest.TestCase):
 def test_serial_selection_never_opens_by_index(self):
  calls=[]
  with patch('host.camera_bridge.ctypes.WinDLL',return_value=Library(calls)):
   device=D2xxDevice(0,'FT5X9ZJ5');device.close()
  self.assertIn(('SERIAL',b'FT5X9ZJ5'),calls)
  self.assertFalse(any(name=='FT_Open' for name,_ in calls))
 def test_index_selection_remains_available(self):
  calls=[]
  with patch('host.camera_bridge.ctypes.WinDLL',return_value=Library(calls)):
   device=D2xxDevice(2);device.close()
  self.assertTrue(any(name=='FT_Open' and args[0]==2 for name,args in calls))
  self.assertFalse(any(name=='FT_OpenEx' for name,_ in calls))

 def test_reconnect_reopens_same_serial_and_discards_stale_handle(self):
  calls=[]
  with patch('host.camera_bridge.ctypes.WinDLL',return_value=Library(calls)):
   device=D2xxDevice(0,'FT5X9ZJ5')
   device.start_stream()
   device.stop_stream()
   device.start_stream()
   device.close()
  self.assertEqual(sum(name=='FT_OpenEx' for name,_ in calls),3)
  self.assertFalse(any(name=='FT_Open' for name,_ in calls))
  self.assertEqual([value for name,value in calls if name=='SERIAL'],[b'FT5X9ZJ5']*3)
  names=[name for name,_ in calls]
  second_open=names.index('FT_OpenEx',names.index('FT_OpenEx')+1)
  self.assertIn('FT_Close',names[:second_open])
