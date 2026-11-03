import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, Check, X, MapPin, AlertTriangle, Loader2, ShieldCheck, MapPinOff, Home, Play, ExternalLink, Clock } from 'lucide-react';
import { attendanceService } from '../../services/attendanceService';

// Determine if current local time in Asia/Kolkata is past 9:30 AM IST
const checkIsLateIST = () => {
  try {
    const istTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    const [h, m] = istTime.split(':').map(Number);
    return (h * 60 + m) > (9 * 60 + 30);
  } catch (e) {
    const d = new Date();
    return (d.getHours() * 60 + d.getMinutes()) > (9 * 60 + 30);
  }
};

export default function AttendanceCheckInModal({ isOpen, onClose, onCheckInSuccess, workMode = 'WFO' }) {
  // Steps: 'location' -> 'camera' -> 'preview'
  const [step, setStep] = useState('location');
  const [gpsCoords, setGpsCoords] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [locationErrorTitle, setLocationErrorTitle] = useState('');
  const [locationErrorCode, setLocationErrorCode] = useState('');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [officeConfig, setOfficeConfig] = useState(null);
  const [measuredDistance, setMeasuredDistance] = useState(null);

  const [cameraStream, setCameraStream] = useState(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraErrorTitle, setCameraErrorTitle] = useState('');
  const [cameraErrorHelp, setCameraErrorHelp] = useState('');
  const [cameraErrorCode, setCameraErrorCode] = useState('');

  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedUrl, setCapturedUrl] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Late check-in reason state
  const [isLateCheckIn, setIsLateCheckIn] = useState(checkIsLateIST);
  const [lateReason, setLateReason] = useState('');

  // Reset late reason and check IST time on open
  useEffect(() => {
    if (isOpen) {
      setIsLateCheckIn(checkIsLateIST());
      setLateReason('');
      setSubmitError('');
    }
  }, [isOpen]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const isRequestingCameraRef = useRef(false);
  const isMountedRef = useRef(true);

  // Stop camera tracks helper
  const stopCamera = useCallback(() => {
    isRequestingCameraRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Track stop error', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStream(null);
    setIsCameraReady(false);
    setIsCameraLoading(false);
    setIsPlaybackBlocked(false);
  }, []);

  // Cleanup on unmount or close
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
      if (capturedUrl) {
        URL.revokeObjectURL(capturedUrl);
      }
    };
  }, [stopCamera, capturedUrl]);

  // STEP 1 & 2: Request & Validate Location
  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setLocationErrorCode('UNSUPPORTED');
      setLocationErrorTitle('Geolocation Unsupported');
      setLocationError('Geolocation API is not supported by your current browser.');
      return;
    }

    setIsGettingLocation(true);
    setLocationError('');
    setLocationErrorTitle('');
    setLocationErrorCode('');

    // Fetch authoritative office geofence config from backend if not already loaded
    let config = officeConfig;
    if (!config) {
      try {
        config = await attendanceService.getOfficeLocation();
        setOfficeConfig(config);
      } catch (e) {
        console.warn('Failed to fetch office location, using default', e);
        config = {
          latitude: 12.9104417,
          longitude: 77.6442435,
          radiusMeters: 250,
          maxAccuracyMeters: 100,
        };
        setOfficeConfig(config);
      }
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp || Date.now()).toISOString(),
        };

        // If employee work mode is Work From Home (WFH), skip office geofencing
        if (workMode === 'WFH') {
          setIsGettingLocation(false);
          setGpsCoords(coords);
          setStep('camera');
          return;
        }

        // Work From Office (WFO) Validation
        const maxAccuracy = config?.maxAccuracyMeters || 100;
        const allowedRadius = config?.radiusMeters || 250;

        // Check GPS accuracy threshold
        if (coords.accuracy > maxAccuracy) {
          setIsGettingLocation(false);
          setLocationErrorCode('INACCURATE_GPS');
          setLocationErrorTitle('Location Accuracy Error');
          setLocationError(
            `Your GPS accuracy is too low (±${Math.round(coords.accuracy)}m). Accurate location within ${maxAccuracy}m is required. Please check your device location settings or move near a window and try again.`
          );
          return;
        }

        // Calculate Haversine distance
        const dist = attendanceService.calculateHaversineDistance(
          coords.latitude,
          coords.longitude,
          config.latitude,
          config.longitude
        );
        setMeasuredDistance(dist);

        // Pre-validate location on FastAPI backend as well
        try {
          await attendanceService.validateLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            workMode: 'WFO',
          });
        } catch (err) {
          setIsGettingLocation(false);
          if (err.status === 401) {
            setLocationErrorCode('UNAUTHORIZED');
            setLocationErrorTitle('Session Expired');
            setLocationError('Your session has expired or could not be validated. Please log in again.');
          } else if (err.status === 403) {
            setLocationErrorCode('FORBIDDEN');
            setLocationErrorTitle('Access Restricted');
            setLocationError(err.message || 'Your employee account is not authorized to punch attendance.');
          } else if (err.status === 404) {
            setLocationErrorCode('NOT_FOUND');
            setLocationErrorTitle('Employee Record Not Found');
            setLocationError('Your employee account could not be found. Please contact the administrator.');
          } else if (err.code === 'OUTSIDE_OFFICE_GEOFENCE' || dist > allowedRadius) {
            setLocationErrorCode('OUTSIDE_OFFICE_GEOFENCE');
            setLocationErrorTitle('Outside Office Geofence');
            setLocationError(
              err.message || 'You are outside the permitted attendance area.'
            );
          } else if (err.code === 'INACCURATE_GPS') {
            setLocationErrorCode('INACCURATE_GPS');
            setLocationErrorTitle('Location Accuracy Error');
            setLocationError(
              `Your GPS accuracy is too low (±${Math.round(coords.accuracy)}m). Accurate location within ${maxAccuracy}m is required. Please check your device location settings or move near a window and try again.`
            );
          } else {
            setLocationErrorCode(err.code || 'VALIDATION_ERROR');
            setLocationErrorTitle('Verification Error');
            setLocationError(err.message || 'Location verification failed.');
          }
          return;
        }

        // Frontend distance check double-validation
        if (dist > allowedRadius) {
          setIsGettingLocation(false);
          setLocationErrorCode('OUTSIDE_OFFICE_GEOFENCE');
          setLocationErrorTitle('Location Verification Failed');
          setLocationError(
            'You are outside the permitted attendance area.'
          );
          return;
        }

        // All checks succeeded -> Proceed to Camera
        setIsGettingLocation(false);
        setGpsCoords(coords);
        setStep('camera');
      },
      (err) => {
        setIsGettingLocation(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationErrorCode('PERMISSION_DENIED');
            setLocationErrorTitle('Location Permission Denied');
            setLocationError(
              'Location permission was denied. Please allow location access in your browser settings to check in for Work From Office.'
            );
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationErrorCode('POSITION_UNAVAILABLE');
            setLocationErrorTitle('Location Unavailable');
            setLocationError(
              'Location services are unavailable or timed out. Please ensure GPS/location is enabled on your device and try again.'
            );
            break;
          case err.TIMEOUT:
            setLocationErrorCode('TIMEOUT');
            setLocationErrorTitle('Location Request Timed Out');
            setLocationError(
              'Location services are unavailable or timed out. Please ensure GPS/location is enabled on your device and try again.'
            );
            break;
          default:
            setLocationErrorCode('UNKNOWN');
            setLocationErrorTitle('Location Error');
            setLocationError(err.message || 'Could not acquire high-accuracy GPS coordinates. Please try again.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [workMode, officeConfig]);

  useEffect(() => {
    if (isOpen) {
      setGpsCoords(null);
      setLocationError('');
      setLocationErrorTitle('');
      setLocationErrorCode('');
      setCameraError('');
      setCameraErrorTitle('');
      setCameraErrorHelp('');
      setCameraErrorCode('');
      setIsCameraLoading(false);
      setIsCameraReady(false);
      setCapturedBlob(null);
      setMeasuredDistance(null);
      if (capturedUrl) {
        URL.revokeObjectURL(capturedUrl);
        setCapturedUrl(null);
      }
      setSubmitError('');
      setIsSubmitting(false);

      if (workMode === 'WFH') {
        // Direct transition to camera for WFH without any location prompt
        setIsGettingLocation(false);
        setStep('camera');
      } else {
        // Request high-accuracy GPS and verify geofence for WFO
        setStep('location');
        requestLocation();
      }
    } else {
      stopCamera();
    }
  }, [isOpen, workMode]);

  // Diagnostic logger for developer console
  const logCameraDiagnostics = useCallback((context, data = {}) => {
    try {
      console.groupCollapsed(`[ArshithConnect Camera Diagnostics: ${context}]`);
      console.log('Timestamp:', new Date().toISOString());
      console.log('Origin:', window?.location?.origin);
      console.log('Secure Context (isSecureContext):', window?.isSecureContext);
      console.log('Protocol:', window?.location?.protocol);
      console.log('Hostname:', window?.location?.hostname);
      console.log('Is inside iframe:', window.self !== window.top);
      console.log('navigator.mediaDevices supported:', !!navigator.mediaDevices);
      console.log('getUserMedia supported:', !!navigator.mediaDevices?.getUserMedia);
      if (Object.keys(data).length > 0) {
        console.log('Details:', data);
      }
      console.groupEnd();
    } catch {
      /* ignore logging errors */
    }
  }, []);

  // Specific, actionable camera error mapping for acquisition failures
  const handleCameraAcquisitionError = useCallback((err) => {
    setIsCameraLoading(false);
    setIsCameraReady(false);
    setIsPlaybackBlocked(false);

    const errName = err?.name || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'current site';
    const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    const is127 = typeof window !== 'undefined' && window.location.hostname === '127.0.0.1';

    logCameraDiagnostics('handleCameraAcquisitionError', { errorName: errName, errorMessage: err?.message, err });

    let code = 'UNKNOWN';
    let title = 'Camera Access Error';
    let message = 'Could not access camera.';
    let help = 'Please check your camera connection and try again.';

    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      code = 'PERMISSION_DENIED';
      title = 'Camera Permission Blocked';
      message = `Camera access was blocked by browser or system permissions for ${origin}.`;
      if (isLocalhost) {
        help = `How to unblock on ${origin}: Click the site settings icon (tune/sliders or padlock) on the left of your URL bar, set Camera to "Allow" (or "Reset permission"), and click Retry Camera Access. Alternatively, switch to http://127.0.0.1:5173.`;
      } else if (is127) {
        help = `How to unblock on ${origin}: Click the site settings icon on the left of your URL bar, set Camera to "Allow", and click Retry Camera Access. Alternatively, switch to http://localhost:5173.`;
      } else {
        help = `How to unblock on ${origin}: Click the site settings icon next to your browser URL bar, set Camera to "Allow", and click Retry Camera Access. Also check Windows Settings > Privacy & security > Camera to ensure camera access is allowed for desktop apps.`;
      }
    } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      code = 'NOT_FOUND';
      title = 'No Camera Detected';
      message = 'No camera device found on your system. Please connect a webcam or camera.';
      help = 'Check that your webcam is plugged in, powered on, and recognized by Windows Device Manager.';
    } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
      code = 'NOT_READABLE';
      title = 'Camera Already in Use';
      message = 'The camera is currently being used by another application or process.';
      help = 'Please close any other programs using the webcam (e.g., Zoom, Google Meet, Microsoft Teams, Skype) and click Retry Camera Access.';
    } else if (errName === 'OverconstrainedError' || errName === 'ConstraintNotSatisfiedError') {
      code = 'OVERCONSTRAINED';
      title = 'Unsupported Camera Settings';
      message = 'The requested camera resolution or settings are unsupported by your camera hardware.';
      help = 'Click Retry Camera Access to start the camera using default hardware constraints.';
    } else if (errName === 'SecurityError') {
      code = 'INSECURE_CONTEXT';
      title = 'Insecure Context (HTTPS Required)';
      message = 'Camera access was blocked by browser security policy.';
      help = 'Browsers require a secure HTTPS connection or localhost (http://localhost:5173) to access the camera.';
    } else if (errName === 'AbortError') {
      code = 'ABORTED';
      title = 'Camera Request Interrupted';
      message = 'Camera initialization was interrupted.';
      help = 'Click Retry Camera Access to reconnect.';
    } else {
      code = 'GENERAL_ERROR';
      title = 'Camera Error';
      message = err?.message || 'Unable to start camera preview.';
      help = 'Please verify that camera permissions are enabled in your browser and Windows privacy settings.';
    }

    setCameraErrorCode(code);
    setCameraErrorTitle(title);
    setCameraError(message);
    setCameraErrorHelp(help);
  }, [logCameraDiagnostics]);

  // STEP 4 — Initialize Camera safely with fallbacks and playback protection
  const startCamera = useCallback(async () => {
    // Avoid concurrent requests
    if (isRequestingCameraRef.current) return;
    isRequestingCameraRef.current = true;

    logCameraDiagnostics('startCamera starting');

    try {
      // Reset error state and start loading
      setCameraError('');
      setCameraErrorTitle('');
      setCameraErrorHelp('');
      setCameraErrorCode('');
      setIsPlaybackBlocked(false);
      setIsCameraLoading(true);
      setIsCameraReady(false);

      // 1. Check secure context (HTTPS, localhost, 127.0.0.1 required by modern browsers)
      const isSecure = (
        typeof window !== 'undefined' &&
        (window.isSecureContext ||
          window.location.protocol === 'https:' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1')
      );

      if (!isSecure) {
        setIsCameraLoading(false);
        setCameraErrorCode('INSECURE_CONTEXT');
        setCameraErrorTitle('Insecure Context (HTTPS Required)');
        setCameraError('Camera access is restricted to secure environments.');
        setCameraErrorHelp(
          'Browsers strictly require HTTPS or localhost (http://localhost:5173) to access the camera. Unencrypted remote IP addresses cannot access media devices.'
        );
        logCameraDiagnostics('Insecure context detected');
        return;
      }

      // 2. Check if inside iframe
      if (typeof window !== 'undefined' && window.self !== window.top) {
        console.warn('[Camera] Running inside an iframe; ensure parent frame delegates camera access via allow="camera".');
      }

      // 3. Check navigator.mediaDevices support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsCameraLoading(false);
        setCameraErrorCode('UNSUPPORTED');
        setCameraErrorTitle('Camera API Unsupported');
        setCameraError('MediaDevices API is not supported by your current browser.');
        setCameraErrorHelp('Please use a modern browser such as Google Chrome, Microsoft Edge, Safari, or Firefox.');
        logCameraDiagnostics('MediaDevices unsupported');
        return;
      }

      // 4. Advisory Permissions API check & change listener
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const perm = await navigator.permissions.query({ name: 'camera' });
          if (perm && perm.state) {
            perm.onchange = () => {
              if (perm.state === 'granted' && isMountedRef.current) {
                isRequestingCameraRef.current = false;
                startCamera();
              }
            };
          }
        }
      } catch {
        /* Permissions API query for camera not supported in all browsers */
      }

      // 5. Check if we already hold an active, live stream
      let stream = streamRef.current;
      const isStreamActive = stream && stream.active && stream.getVideoTracks().some(t => t.readyState === 'live');

      if (!isStreamActive) {
        // Stop any stale tracks first
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {
              /* ignore */
            }
          });
          streamRef.current = null;
        }

        // Request stream with preferred constraint (facingMode: user, NO AUDIO)
        try {
          const preferredConstraints = {
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
            audio: false,
          };
          stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
        } catch (prefErr) {
          logCameraDiagnostics('Preferred camera constraints failed, attempting fallback', { prefErr });
          
          // If error is permission denial or no camera, universal fallback won't change result
          if (prefErr.name === 'NotAllowedError' || prefErr.name === 'PermissionDeniedError' || prefErr.name === 'NotFoundError') {
            handleCameraAcquisitionError(prefErr);
            return;
          }

          try {
            const fallbackConstraints = {
              video: true,
              audio: false,
            };
            stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          } catch (fbErr) {
            logCameraDiagnostics('Fallback camera constraint also failed', { fbErr });
            handleCameraAcquisitionError(fbErr || prefErr);
            return;
          }
        }
      }

      if (!stream) {
        handleCameraAcquisitionError(new Error('Failed to acquire camera stream.'));
        return;
      }

      streamRef.current = stream;
      setCameraStream(stream);

      // 6. Attach stream to video element and verify readiness
      const video = videoRef.current;
      if (video) {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');

        const waitForVideoReady = () => {
          return new Promise((resolve) => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              resolve();
              return;
            }
            let resolved = false;
            const onReady = () => {
              if (!resolved) {
                resolved = true;
                video.removeEventListener('loadeddata', onReady);
                video.removeEventListener('canplay', onReady);
                video.removeEventListener('playing', onReady);
                resolve();
              }
            };
            video.addEventListener('loadeddata', onReady, { once: true });
            video.addEventListener('canplay', onReady, { once: true });
            video.addEventListener('playing', onReady, { once: true });
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve();
              }
            }, 1500);
          });
        };

        try {
          await video.play();
          await waitForVideoReady();
          if (isMountedRef.current) {
            setIsCameraReady(true);
            setIsCameraLoading(false);
            setIsPlaybackBlocked(false);
          }
        } catch (playErr) {
          logCameraDiagnostics('video.play() rejected', { playErr });
          if (playErr.name === 'AbortError') {
            try {
              await video.play();
              await waitForVideoReady();
              if (isMountedRef.current) {
                setIsCameraReady(true);
                setIsCameraLoading(false);
                setIsPlaybackBlocked(false);
              }
              return;
            } catch {
              /* ignore and fall through to manual play button */
            }
          }
          // Autoplay policy paused video.play() -> Never mask as permission denied!
          if (isMountedRef.current) {
            setIsCameraLoading(false);
            setIsPlaybackBlocked(true);
          }
        }
      } else {
        if (isMountedRef.current) {
          setIsCameraReady(true);
          setIsCameraLoading(false);
        }
      }
    } catch (outerErr) {
      logCameraDiagnostics('Unexpected error in startCamera', { outerErr });
      handleCameraAcquisitionError(outerErr);
    } finally {
      isRequestingCameraRef.current = false;
    }
  }, [handleCameraAcquisitionError, logCameraDiagnostics]);

  // Launch camera when entering camera step
  useEffect(() => {
    if (step === 'camera' && isOpen) {
      if (!streamRef.current || !streamRef.current.active) {
        startCamera();
      }
    }
  }, [step, isOpen]); // Intentionally omit startCamera to avoid re-trigger loops

  // Handler for explicit retry
  const handleRetryCamera = () => {
    if (isCameraLoading) return;
    isRequestingCameraRef.current = false;
    stopCamera();
    setCameraError('');
    setCameraErrorCode('');
    setCameraErrorTitle('');
    setCameraErrorHelp('');
    setIsPlaybackBlocked(false);
    setIsCameraLoading(true);
    startCamera();
  };

  // Capture frame to blob
  const handleCapturePhoto = () => {
    if (!videoRef.current || !isCameraReady) return;

    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setCameraError('Camera stream is still initializing. Please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally for natural mirror feel
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Failed to capture image snapshot.');
          return;
        }
        stopCamera();
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setCapturedUrl(url);
        setStep('preview');
      },
      'image/jpeg',
      0.9
    );
  };

  const handleRetake = () => {
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
      setCapturedUrl(null);
    }
    setCapturedBlob(null);
    setStep('camera');
  };

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // Prevent background page from scrolling while modal is active
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Keyboard shortcut: Escape to cancel / close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, handleClose]);

  // Submit Check-In to Backend
  const handleConfirmCheckIn = async () => {
    if (!capturedBlob) {
      setSubmitError('Please capture a clear verification photograph before confirming check-in.');
      return;
    }
    if (workMode === 'WFO' && !gpsCoords) {
      setSubmitError('GPS location verification is required for Work From Office (WFO) check-in.');
      return;
    }
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setSubmitError('');

      // Ensure Blob has proper mime type
      const photoBlob = capturedBlob instanceof Blob
        ? (capturedBlob.type ? capturedBlob : new Blob([capturedBlob], { type: 'image/jpeg' }))
        : capturedBlob;

      const formData = new FormData();
      formData.append('photo', photoBlob, 'check_in_selfie.jpg');
      if (gpsCoords) {
        formData.append('latitude', gpsCoords.latitude);
        formData.append('longitude', gpsCoords.longitude);
        formData.append('accuracy', gpsCoords.accuracy);
        formData.append('timestamp', gpsCoords.timestamp || new Date().toISOString());
      }
      formData.append('workMode', workMode);

      // Validate and append mandatory late reason if checking in after 9:30 AM IST
      if (isLateCheckIn) {
        const trimmedReason = (lateReason || '').trim();
        if (!trimmedReason) {
          setSubmitError('Please provide a valid reason for your late arrival before confirming check-in.');
          setIsSubmitting(false);
          return;
        }
        formData.append('lateReason', trimmedReason);
      }

      const res = await attendanceService.checkIn(formData);

      if (!res || !res.success || !res.hasCheckInPhoto) {
        throw new Error(res?.message || 'Attendance record created, but photograph persistence could not be confirmed by the server.');
      }

      stopCamera();
      if (onCheckInSuccess) {
        onCheckInSuccess(res);
      }
      onClose();
    } catch (err) {
      console.error('Check-in submission failed', err);
      const isLateErr =
        err?.status === 400 &&
        (err?.message?.includes('9:30 AM') ||
         err?.message?.includes('late check-in reason') ||
         err?.code === 'LATE_REASON_REQUIRED' ||
         err?.detail?.code === 'LATE_REASON_REQUIRED');
      if (isLateErr) {
        setIsLateCheckIn(true);
        setSubmitError('Check-in time is after 9:30 AM IST. Please provide your reason for late arrival above to proceed.');
      } else {
        setSubmitError(err.message || 'Check-in failed. Please retry.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="attendance-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div
        className="attendance-modal-container"
        style={{ maxWidth: '500px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-modal-title"
      >
        {/* Modal Header */}
        <div className="attendance-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="modal-header-icon-pill">
              <ShieldCheck size={20} color="#059669" />
            </div>
            <div>
              <h2 id="attendance-modal-title" className="attendance-modal-title">Attendance Check-In</h2>
              <span className="attendance-modal-subtitle">
                {workMode === 'WFO'
                  ? 'GPS Geofence & Live Camera Verification • WFO (Office)'
                  : 'Live Camera Selfie Verification • WFH (Home)'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="attendance-modal-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="attendance-modal-body">
          {/* STEP 1: Location Acquisition & Verification */}
          {step === 'location' && (
            <div className="step-container">
              {/* Normal Location Progress State */}
              {isGettingLocation && (
                <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                  <div className="location-icon-wrapper" style={{ margin: '0 auto 16px auto' }}>
                    <MapPin size={42} color="#0d9488" />
                  </div>
                  <h3 className="step-title">Verifying Location</h3>
                  <p className="step-description">
                    Checking your current GPS coordinates against the permitted attendance area.
                  </p>
                  <div className="status-loading-box" style={{ marginTop: '16px' }}>
                    <Loader2 size={20} className="spinner-icon" />
                    <span>Acquiring your current GPS location...</span>
                  </div>
                </div>
              )}

              {/* Step 3: Location Verification Failed / Error Popup */}
              {!isGettingLocation && locationError && (
                <div className="location-failed-modal-card animate-fade-in" style={{ textAlign: 'center', padding: '12px 6px' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      backgroundColor: '#fef2f2',
                      border: '2px solid #fecaca',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px auto',
                      color: '#dc2626',
                    }}
                  >
                    {locationErrorCode === 'OUTSIDE_OFFICE_GEOFENCE' ? (
                      <MapPinOff size={32} />
                    ) : (
                      <AlertTriangle size={32} />
                    )}
                  </div>

                  <h3
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: '800',
                      color: '#991b1b',
                      margin: '0 0 10px 0',
                    }}
                  >
                    {locationErrorTitle || 'Location Verification Failed'}
                  </h3>

                  <p
                    style={{
                      fontSize: '0.9rem',
                      color: '#334155',
                      lineHeight: 1.55,
                      margin: '0 auto 20px auto',
                      maxWidth: '440px',
                    }}
                  >
                    {locationError}
                  </p>

                  {/* Registered Company Location Info Card */}
                  {locationErrorCode === 'OUTSIDE_OFFICE_GEOFENCE' && (
                    <div
                      style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        margin: '0 auto 20px auto',
                        maxWidth: '440px',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                        color: '#475569',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: '700',
                          color: '#0b3d2b',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <MapPin size={14} color="#059669" />
                        <span>Permitted Attendance Area</span>
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#64748b' }}>
                        Permitted Radius: <strong>{officeConfig?.radiusMeters || 250} metres</strong>
                        {measuredDistance !== null && (
                          <span>
                            {' '}&bull; Measured Distance:{' '}
                            <strong style={{ color: '#dc2626' }}>
                              {measuredDistance > 1000
                                ? `${(measuredDistance / 1000).toFixed(2)} km away`
                                : `${Math.round(measuredDistance)} m away`}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Helpful Tip for Browser Permission */}
                  {locationErrorCode === 'PERMISSION_DENIED' && (
                    <div
                      style={{
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        margin: '0 auto 20px auto',
                        maxWidth: '440px',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                        color: '#1e40af',
                      }}
                    >
                      <strong>How to enable location:</strong>
                      <div style={{ marginTop: '4px' }}>
                        Click the site permissions icon next to the URL bar in your browser, toggle <strong>Location</strong> to <em>Allow</em>, and click <strong>TRY AGAIN</strong>.
                      </div>
                    </div>
                  )}

                  {/* Action Buttons: TRY AGAIN + Cancel */}
                  <div className="modal-actions-footer" style={{ justifyContent: 'center', gap: '12px' }}>
                    <button
                      type="button"
                      className="btn-modal-cancel"
                      onClick={handleClose}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-modal-primary"
                      onClick={requestLocation}
                      style={{ minWidth: '140px', backgroundColor: '#0b3d2b' }}
                    >
                      <RefreshCw size={15} />
                      <span>TRY AGAIN</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4 — Live Camera View (Opened ONLY after successful location validation) */}
          {step === 'camera' && (
            <div className="step-container">
              {/* Location / Work Mode Badge Indicator */}
              {gpsCoords ? (
                <div className="location-chip-banner">
                  <MapPin size={14} color="#059669" />
                  <span>
                    Location Verified (Within {officeConfig?.radiusMeters || 250}m): {gpsCoords.latitude.toFixed(4)}°, {gpsCoords.longitude.toFixed(4)}°
                    &nbsp;(±{Math.round(gpsCoords.accuracy)}m)
                  </span>
                </div>
              ) : (
                <div className="location-chip-banner" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                  <Home size={14} color="#2563eb" />
                  <span>
                    Work Mode: <strong>WFH (Home)</strong> &bull; Remote Attendance (No Geofence Required)
                  </span>
                </div>
              )}

              {/* Camera Preview Area */}
              <div className="camera-preview-wrapper" style={{ position: 'relative' }}>
                {/* 1. Video stream element - Kept rendered in DOM with opacity so decoders stay active */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="camera-video-stream"
                  style={{
                    opacity: !cameraError && isCameraReady ? 1 : 0,
                    visibility: !cameraError ? 'visible' : 'hidden',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    zIndex: 1,
                  }}
                />

                {/* 2. Face alignment guideline overlay & ready status - shown when video is ready */}
                {!cameraError && isCameraReady && (
                  <>
                    <div className="face-guide-overlay" style={{ zIndex: 3 }}>
                      <div className="face-oval-frame" />
                      <span className="face-guide-hint">Align your face inside the frame</span>
                    </div>
                    <div className="camera-ready-badge" style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 3 }}>
                      <span className="camera-live-dot" />
                      <span>Camera Ready</span>
                    </div>
                  </>
                )}

                {/* 3. Loading state overlay while camera is starting */}
                {isCameraLoading && !cameraError && (
                  <div
                    className="camera-loading-overlay animate-fade-in"
                    style={{ zIndex: 2, position: 'absolute', top: 0, left: 0 }}
                  >
                    <Loader2 size={36} className="spinner-icon" style={{ color: '#10b981' }} />
                    <h4 style={{ color: '#ffffff', marginTop: '12px', marginBottom: '4px', fontSize: '1rem', fontWeight: 700 }}>
                      Starting Camera
                    </h4>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.82rem', maxWidth: '340px', lineHeight: 1.45 }}>
                      Requesting camera access and preparing your live preview.
                    </p>
                  </div>
                )}

                {/* 3b. Autoplay paused/blocked overlay (User Gesture Required) */}
                {isPlaybackBlocked && !cameraError && (
                  <div
                    className="camera-loading-overlay animate-fade-in"
                    style={{ zIndex: 3, position: 'absolute', top: 0, left: 0 }}
                  >
                    <div className="camera-error-icon-pill" style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                      <Play size={22} color="#38bdf8" />
                    </div>
                    <h4 style={{ color: '#ffffff', marginTop: '12px', marginBottom: '4px', fontSize: '1rem', fontWeight: 700 }}>
                      Camera Connected
                    </h4>
                    <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.82rem', maxWidth: '340px', lineHeight: 1.45 }}>
                      Camera access is granted. Click below to start the live video preview.
                    </p>
                    <button
                      type="button"
                      className="btn-retry-action"
                      onClick={async () => {
                        if (videoRef.current) {
                          try {
                            await videoRef.current.play();
                            setIsCameraReady(true);
                            setIsPlaybackBlocked(false);
                          } catch (e) {
                            console.error('Manual video.play() error:', e);
                          }
                        }
                      }}
                      style={{ marginTop: '12px', backgroundColor: '#0284c7' }}
                    >
                      <Play size={14} />
                      <span>Start Video Preview</span>
                    </button>
                  </div>
                )}

                {/* 4. Error state placeholder */}
                {cameraError && (
                  <div
                    className="camera-error-placeholder animate-fade-in"
                    style={{ zIndex: 4, position: 'relative' }}
                  >
                    <div className="camera-error-icon-pill">
                      <AlertTriangle size={22} color="#ef4444" />
                    </div>
                    <h4 className="camera-error-title">
                      {cameraErrorCode === 'PERMISSION_DENIED'
                        ? 'Camera Permission Blocked'
                        : (cameraErrorTitle || 'Camera Access Unavailable')}
                    </h4>
                    <p className="camera-error-msg">
                      {cameraError}
                    </p>
                    {cameraErrorHelp && (
                      <div className="camera-error-help-box">
                        <span className="camera-error-help-text">
                          {cameraErrorHelp}
                        </span>
                      </div>
                    )}

                    {/* Quick origin switcher if blocked on localhost or 127.0.0.1 */}
                    {cameraErrorCode === 'PERMISSION_DENIED' && typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = window.location.href.replace('localhost', '127.0.0.1');
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '6px',
                          marginBottom: '6px',
                          padding: '6px 14px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #38bdf8',
                          borderRadius: '8px',
                          color: '#38bdf8',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <ExternalLink size={13} />
                        <span>Switch to http://127.0.0.1:5173</span>
                      </button>
                    )}

                    {cameraErrorCode === 'PERMISSION_DENIED' && typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && (
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = window.location.href.replace('127.0.0.1', 'localhost');
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '6px',
                          marginBottom: '6px',
                          padding: '6px 14px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #38bdf8',
                          borderRadius: '8px',
                          color: '#38bdf8',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <ExternalLink size={13} />
                        <span>Switch to http://localhost:5173</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn-retry-action"
                      onClick={handleRetryCamera}
                      disabled={isCameraLoading}
                      style={{ marginTop: '10px' }}
                    >
                      <RefreshCw size={14} className={isCameraLoading ? 'spinner-icon' : ''} />
                      <span>{isCameraLoading ? 'Starting Camera...' : 'Retry Camera Access'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Footer Buttons for Camera Step */}
              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={handleClose}
                >
                  Cancel
                </button>
                {!cameraError && isCameraReady && (
                  <button
                    type="button"
                    className="btn-modal-primary"
                    onClick={handleCapturePhoto}
                  >
                    <Camera size={16} />
                    <span>CAPTURE PHOTO</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 4b — Photo Preview and Confirmation */}
          {step === 'preview' && (
            <div className="step-container">
              {/* Verified Location / Work Mode Banner */}
              {gpsCoords ? (
                <div className="location-chip-banner">
                  <MapPin size={14} color="#059669" />
                  <span>
                    Location Verified ({workMode}) &bull; Accuracy: ±{Math.round(gpsCoords.accuracy)}m
                  </span>
                </div>
              ) : (
                <div className="location-chip-banner" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                  <Home size={14} color="#2563eb" />
                  <span>
                    Work Mode: <strong>WFH (Home)</strong> &bull; Remote Attendance
                  </span>
                </div>
              )}

              {/* Captured Photo Preview */}
              <div className="captured-photo-container">
                <img
                  src={capturedUrl}
                  alt="Captured check-in selfie"
                  className="captured-photo-img"
                />
                <div className="photo-verified-stamp">
                  <Check size={14} />
                  <span>Selfie Captured</span>
                </div>
              </div>

              {/* Late Check-in Reason Input (Mandatory when after 9:30 AM IST) */}
              {isLateCheckIn && (
                <div
                  className="late-reason-input-card animate-fade-in"
                  style={{
                    marginTop: '14px',
                    padding: '12px 14px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '12px',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Clock size={16} color="#b45309" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}>
                      Late Check-in Reason (Required after 9:30 AM IST) <span style={{ color: '#dc2626' }}>*</span>
                    </span>
                  </div>
                  <textarea
                    id="late-checkin-reason-input"
                    value={lateReason}
                    onChange={(e) => {
                      setLateReason(e.target.value);
                      if (submitError) setSubmitError('');
                    }}
                    placeholder="Please explain why your check-in is after 9:30 AM..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: submitError && !lateReason.trim() ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      fontSize: '0.85rem',
                      color: '#1e293b',
                      resize: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#78350f', marginTop: '4px' }}>
                    Check-in is recorded in Asia/Kolkata timezone. A valid reason must be provided before check-in can be finalized.
                  </div>
                </div>
              )}

              {submitError && (
                <div className="error-alert-box" style={{ marginTop: '12px' }}>
                  <AlertTriangle size={16} color="#dc2626" />
                  <span style={{ fontSize: '0.85rem', color: '#b91c1c' }}>{submitError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="btn-modal-secondary"
                  onClick={handleRetake}
                  disabled={isSubmitting}
                >
                  <RefreshCw size={15} />
                  <span>RETAKE</span>
                </button>
                <button
                  type="button"
                  className="btn-modal-primary"
                  onClick={handleConfirmCheckIn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="spinner-icon" />
                      <span>CHECKING IN...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>CONFIRM CHECK IN</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
