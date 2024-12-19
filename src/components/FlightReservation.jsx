import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// Custom debounce implementation
function useDebounce(callback, delay) {
  const timeoutRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedCallback = useCallback(
    (...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );

  return debouncedCallback;
}

const FlightReservation = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [visibleDays, setVisibleDays] = useState([new Date()]);
  const [studentId, setStudentId] = useState('');
  const [timeSlots, setTimeSlots] = useState([]);
  const [hoveredReservation, setHoveredReservation] = useState(null);
  const [tooltipTimer, setTooltipTimer] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [baseUrl, setBaseUrl] = useState('http://localhost:9000');
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Add URL configuration effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostParam = params.get('host');
    if (hostParam) {
      setBaseUrl(`https://${hostParam}`);
    }
  }, []);

  // Calculate visible days based on screen width
  const calculateVisibleDays = () => {
    const columnWidth = 100;
    const availableWidth = window.innerWidth - 200;
    return Math.floor(availableWidth / columnWidth);
  };

  // Fetch instructors or aircraft
  const fetchTimeSlotByType = async (startTime, endTime, type) => {
    try {
      const response = await fetch(`${baseUrl}/flight/time-slot-view-by-type-and-time-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantType: type,
          timeBegin: startTime.toISOString(),
          timeEnd: endTime.toISOString(),
        }),
      });

      if (!response.ok) throw new Error(`Failed to fetch ${type} time slots`);
      const data = await response.json();
      return data.timeSlots.filter((slot) => slot.status === 'available');
    } catch (error) {
      console.error(`Error fetching ${type} time slots:`, error);
      return [];
    }
  };

  const fetchTimeSlotsByStudentId = async (studentId, startTime, endTime) => {
    try {
      const response = await fetch(`${baseUrl}/flight/time-slot-view-by-participant-and-time-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantId: studentId,
          participantType: 'student',
          timeBegin: startTime.toISOString(),
          timeEnd: endTime.toISOString(),
        }),
      });
      const data = await response.json();
      return (data.timeSlots || []).filter((slot) => slot.status === 'available' || slot.status === 'scheduled');
    } catch (error) {
      console.error('Error fetching student time slots:', error);
      return [];
    }
  };

  const fetchTimeSlots = async (studentId, startTime, endTime) => {
    if (!studentId) return; // Skip if no studentId

    try {
      // Fetch all data in parallel
      const [studentSlots, instructorSlots, aircraftSlots] = await Promise.all([
        fetchTimeSlotsByStudentId(studentId, startTime, endTime),
        fetchTimeSlotByType(startTime, endTime, 'instructor'),
        fetchTimeSlotByType(startTime, endTime, 'aircraft'),
      ]);

      // Process and combine the data
      const updatedSlots = studentSlots.map((studentSlot) => {
        const slotTime = new Date(studentSlot.startTime);
        const slotEndTime = new Date(slotTime.getTime() + 60 * 60 * 1000); // 1 hour later

        const availableInstructors = instructorSlots.filter((instrSlot) => new Date(instrSlot.startTime).getTime() === slotTime.getTime());

        const availableAircraft = aircraftSlots.filter((acftSlot) => new Date(acftSlot.startTime).getTime() === slotTime.getTime());

        return {
          ...studentSlot,
          isClickable: availableInstructors.length > 0 && availableAircraft.length > 0,
          instructorCount: availableInstructors.length,
          aircraftCount: availableAircraft.length,
        };
      });

      setTimeSlots(updatedSlots);
    } catch (error) {
      console.error('Error fetching time slots:', error);
      setTimeSlots([]);
    }
  };

  const createReservation = async (studentId, startTime) => {
    const reservationId = Array.from({ length: 6 }, () => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)]).join('');

    const response = await fetch(`${baseUrl}/flight/booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reservationId,
        studentId,
        reservationTime: startTime.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create reservation');
    }

    const data = await response.json();
    return data;
  };

  const cancelReservation = async (reservationId) => {
    try {
      const response = await fetch(`${baseUrl}/flight/reservation-cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reservationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel reservation');
      }
    } catch (error) {
      console.error('Error canceling reservation:', error);
    }
  };

  const fetchReservationDetails = async (reservationId) => {
    try {
      const response = await fetch(`${baseUrl}/flight/reservation/${reservationId}`);
      if (!response.ok) throw new Error('Failed to fetch reservation details');
      const data = await response.json();
      return {
        id: data.reservationId,
        time: new Date(data.reservationTime).toLocaleString('en-US', { hour12: false }),
        studentId: data.student.participantId,
        instructorId: data.instructor.participantId,
        aircraftId: data.aircraft.participantId,
      };
    } catch (error) {
      console.error('Error fetching reservation details:', error);
      return null;
    }
  };

  // Debounced fetch handler
  const debouncedFetch = useDebounce((value) => {
    if (value) {
      const firstSlot = new Date(visibleDays[0]);
      firstSlot.setHours(0, 0, 0, 0);
      const lastSlot = new Date(visibleDays[visibleDays.length - 1]);
      lastSlot.setHours(23, 59, 59, 999);
      fetchTimeSlots(value, firstSlot, lastSlot);
    }
  }, 300);

  // Handle student ID input
  const handleStudentIdChange = (e) => {
    const value = e.target.value;
    setStudentId(value);
    debouncedFetch(value);
  };

  // Handle time slot click
  const handleTimeSlotClick = async (date, hour, status, reservationId) => {
    if (isTimeSlotPast(date, hour)) return;

    const startTime = new Date(date);
    startTime.setHours(hour, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(hour, 59, 59, 999);

    if (status === 'available') {
      await createReservation(studentId, startTime);
    } else if (status === 'scheduled') {
      await cancelReservation(reservationId);
    }
  };

  // Handle reservation hover
  const handleReservationHover = (event, reservationId) => {
    const { clientX, clientY } = event;
    clearTimeout(tooltipTimer);

    const timer = setTimeout(async () => {
      const details = await fetchReservationDetails(reservationId);
      setHoveredReservation(details);
      setTooltipPosition({ x: clientX, y: clientY });
    }, 300);

    setTooltipTimer(timer);
  };

  const handleReservationLeave = () => {
    clearTimeout(tooltipTimer);
    setHoveredReservation(null);
  };

  // Update visible days when startDate changes
  useEffect(() => {
    const numDays = calculateVisibleDays();
    const days = Array.from({ length: numDays }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      return date;
    });
    setVisibleDays(days);
  }, [startDate]);

  const handleScroll = (days) => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + days);
    setStartDate(newDate);
  };

  const formatDate = (date) => {
    if (!date) return '';
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return `${days[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
  };

  const formatScrollDate = (date) => {
    if (!date) return '';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className='flex flex-col'>
        <span>{days[date.getDay()]}</span>
        <span>
          {date.getMonth() + 1}/{date.getDate()}
        </span>
      </div>
    );
  };

  const isTimeSlotPast = (date, hour) => {
    const now = new Date();
    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);
    return slotTime < now;
  };

  const getTimeSlotStatus = (date, hour) => {
    if (!Array.isArray(timeSlots)) return null;

    const slotTime = new Date(date);
    slotTime.setHours(hour, 0, 0, 0);

    const slot = timeSlots.find((slot) => {
      const startTime = new Date(slot.startTime);
      return startTime.getTime() === slotTime.getTime();
    });

    if (!slot) return null;
    return { status: slot.status, reservationId: slot.reservationId };
  };

  const getTimeSlotClass = (date, hour) => {
    if (isTimeSlotPast(date, hour)) {
      return 'bg-gray-100 bg-opacity-10 cursor-not-allowed';
    }

    const slot = timeSlots.find((slot) => {
      const startTime = new Date(slot.startTime);
      return startTime.getTime() === new Date(date).setHours(hour, 0, 0, 0);
    });

    if (!slot) return '';

    if (slot.isClickable) {
      return 'bg-green-700 bg-opacity-50 hover:bg-green-600 cursor-pointer text-yellow-500';
    } else if (slot.status === 'available') {
      return 'bg-yellow-700 bg-opacity-50 text-yellow-500';
    } else if (slot.status === 'scheduled') {
      return 'bg-blue-500 bg-opacity-50 hover:bg-blue-400 text-yellow-500 hover:text-yellow-50 cursor-pointer';
    }

    return '';
  };

  const getTimeSlotCounts = (date, hour) => {
    const slot = timeSlots.find((slot) => {
      const startTime = new Date(slot.startTime);
      return startTime.getTime() === new Date(date).setHours(hour, 0, 0, 0);
    });

    if (!slot) return null;

    if (slot.status === 'scheduled') {
      return <div className='text-[10px] flex flex-col'>{slot.reservationId && <div>{slot.reservationId}</div>}</div>;
    }

    if (slot.status === 'available') {
      return (
        <div className='text-[10px] mt-1'>
          I-{slot.instructorCount}, A-{slot.aircraftCount}
        </div>
      );
    }

    return null;
  };

  // Periodic time slot grid refresh
  useEffect(() => {
    // Initial fetch
    if (studentId) {
      const firstSlot = new Date(visibleDays[0]);
      firstSlot.setHours(0, 0, 0, 0);
      const lastSlot = new Date(visibleDays[visibleDays.length - 1]);
      lastSlot.setHours(24, 0, 0, 0);
      fetchTimeSlots(studentId, firstSlot, lastSlot);
    }

    // Set up interval
    const intervalId = setInterval(() => {
      if (studentId && visibleDays.length > 0) {
        const firstSlot = new Date(visibleDays[0]);
        firstSlot.setHours(0, 0, 0, 0);
        const lastSlot = new Date(visibleDays[visibleDays.length - 1]);
        lastSlot.setHours(23, 59, 59, 999);
        fetchTimeSlots(studentId, firstSlot, lastSlot);
      }
    }, 500); // Refresh every 0.5 second

    // Cleanup
    return () => clearInterval(intervalId);
  }, [studentId, visibleDays]); // Dependencies

  return (
    <div className='flex flex-col h-screen bg-gray-900 text-gray-100'>
      {/* Header Controls */}
      <div className='p-4 bg-gray-800 border-b border-gray-700 flex justify-between'>
        <div className='flex items-center space-x-4'>
          <input type='text' placeholder='Student ID' className='bg-gray-700 text-gray-100 p-2 rounded' value={studentId} onChange={handleStudentIdChange} />
          <h1 className='text-xl font-semibold text-yellow-500'>Book a flight lesson</h1>
          <button onClick={() => setIsHelpModalOpen(true)} className='w-8 h-8 rounded-full bg-yellow-500 text-gray-900 flex items-center justify-center hover:bg-yellow-400 font-bold'>
            ?
          </button>
        </div>
        <Link to={baseUrl.startsWith('https://') ? `/?host=${baseUrl.replace('https://', '')}` : '/'} className='p-2 bg-gray-700 rounded hover:bg-gray-600 text-yellow-500 hover:text-white'>
          Calendar
        </Link>
      </div>

      {/* Help modal */}
      {isHelpModalOpen && (
        <div className='fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4'>
          <div className='bg-gray-800 rounded-lg max-w-2xl w-full p-6 relative'>
            <button onClick={() => setIsHelpModalOpen(false)} className='absolute top-4 right-4 text-gray-400 hover:text-white'>
              ✕
            </button>
            <h2 className='text-2xl font-bold text-yellow-500 mb-4'>Scheduling Flight Training Lessons</h2>
            <div className='text-gray-300 space-y-4'>
              <section class='mb-8'>
                <h2 class='text-lg font-semibold text-gray-200 mb-3'>Creating Reservations</h2>
                <ol class='list-decimal list-inside space-y-2 text-gray-300'>
                  <li class='pl-2'>Enter your student ID</li>
                  <li class='pl-2'>
                    Look for available time slots:
                    <ul class='list-disc list-inside ml-6 mt-2 space-y-1'>
                      <li class='text-green-700'>Green slots = All participants available</li>
                      <li class='text-orange-700'>Orange slots = You are available but instructor/aircraft are not</li>
                    </ul>
                  </li>
                  <li class='pl-2'>Click a green slot to create your reservation</li>
                </ol>
              </section>

              <section class='mb-8'>
                <h2 class='text-lg font-semibold text-gray-200 mb-3'>Managing Reservations</h2>
                <ul class='list-disc list-inside space-y-2 text-gray-300'>
                  <li class='pl-2'>Hover over blue slots to see reservation details</li>
                  <li class='pl-2'>Click a blue slot to cancel your reservation</li>
                  <li class='pl-2 font-medium text-red-500'>Cancellation is immediate - no confirmation needed</li>
                </ul>
              </section>

              <section class='mb-8'>
                <h2 class='text-lg font-semibold text-gray-200 mb-3'>Best Practices</h2>
                <ul class='list-disc list-inside space-y-2 text-gray-300'>
                  <li class='pl-2'>Update your availability regularly</li>
                  <li class='pl-2'>Check reservation details before canceling</li>
                  <li class='pl-2'>Plan ahead using navigation buttons</li>
                </ul>
              </section>

              <section>
                <h2 class='text-lg font-semibold text-gray-200 mb-3'>Navigation</h2>
                <ul class='list-disc list-inside space-y-2 text-gray-300'>
                  <li class='pl-2'>Use 1d, 7d, or 30d buttons to move forward/backward in time</li>
                </ul>
              </section>

              <section class='mt-8 p-4 bg-gray-700 rounded-md'>
                <h2 class='text-sm font-semibold text-gray-200 mb-3'>Color Guide</h2>
                <div class='space-y-2'>
                  <div class='flex items-center'>
                    <div class='w-4 h-4 bg-green-500 rounded mr-2'></div>
                    <span class='text-sm text-gray-300'>Available to Schedule (All Participants Available)</span>
                  </div>
                  <div class='flex items-center'>
                    <div class='w-4 h-4 bg-orange-500 rounded mr-2'></div>
                    <span class='text-sm text-gray-300'>Partially Available (Missing Instructor or Aircraft)</span>
                  </div>
                  <div class='flex items-center'>
                    <div class='w-4 h-4 bg-blue-500 rounded mr-2'></div>
                    <span class='text-sm text-gray-300'>Scheduled Reservation</span>
                  </div>
                </div>
              </section>
            </div>
            <button onClick={() => setIsHelpModalOpen(false)} className='mt-6 px-4 py-2 bg-yellow-500 text-gray-900 rounded hover:bg-yellow-400'>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className='flex flex-1 relative'>
        {/* Left Scroll Buttons */}
        <div className='absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-center space-y-4 bg-gray-800 bg-opacity-50 p-2'>
          <div className='text-sm text-center mb-4'>{visibleDays.length > 0 && formatScrollDate(visibleDays[0])}</div>
          <button onClick={() => handleScroll(-1)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center justify-center'>
            <ChevronLeft className='w-5 h-5' />
            <span>1d</span>
          </button>
          <button onClick={() => handleScroll(-7)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center justify-center'>
            <ChevronLeft className='w-5 h-5' />
            <span>7d</span>
          </button>
          <button onClick={() => handleScroll(-30)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center justify-center'>
            <ChevronLeft className='w-5 h-5' />
            <span>30d</span>
          </button>
        </div>

        {/* Time Slots Grid */}
        <div className='flex-1 overflow-x-hidden mx-16'>
          <div className='flex h-[calc(100%-2rem)]'>
            {visibleDays.map((date) => (
              <div key={date.toISOString()} className='flex-1 min-w-[100px] border-l border-gray-700'>
                <div className='text-sm text-center py-2 h-8'>{formatDate(date)}</div>
                <div className='flex flex-col h-full'>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const slotInfo = getTimeSlotStatus(date, hour);
                    return (
                      <div
                        key={hour}
                        className={`flex-1 border-t border-gray-700 flex flex-col justify-center text-xs text-center ${getTimeSlotClass(date, hour)}`}
                        onClick={() => handleTimeSlotClick(date, hour, slotInfo?.status, slotInfo?.reservationId)}
                        onMouseEnter={(e) => slotInfo?.status === 'scheduled' && handleReservationHover(e, slotInfo.reservationId)}
                        onMouseLeave={handleReservationLeave}
                      >
                        <div>{String(hour).padStart(2, '0')}:00</div>
                        {getTimeSlotCounts(date, hour)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Scroll Buttons */}
        <div className='absolute right-0 top-0 bottom-0 w-16 flex flex-col justify-center space-y-4 bg-gray-800 bg-opacity-50 p-2'>
          <div className='text-sm text-center mb-4'>{visibleDays.length > 0 && formatScrollDate(visibleDays[visibleDays.length - 1])}</div>
          <button onClick={() => handleScroll(1)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center justify-center'>
            <ChevronRight className='w-5 h-5' />
            <span>1d</span>
          </button>
          <button onClick={() => handleScroll(7)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center justify-center'>
            <ChevronRight className='w-5 h-5' />
            <span>7d</span>
          </button>
          <button onClick={() => handleScroll(30)} className='p-2 bg-gray-700 rounded hover:bg-gray-600 flex flex-col items-center justify-center'>
            <ChevronRight className='w-5 h-5' />
            <span>30d</span>
          </button>
        </div>

        {/* Reservation Tooltip */}
        {hoveredReservation && (
          <div
            className='absolute bg-blue-950/90 shadow-lg z-50 text-sm border border-gray-600 backdrop-blur-sm'
            style={{
              left: tooltipPosition.x + 5,
              top: tooltipPosition.y + 5,
            }}
          >
            <div className='bg-blue-400 text-gray-900 font-semibold px-2 py-1'>Reservation: {hoveredReservation.id}</div>
            <div className='bg-gray-300 text-gray-900 px-2 py-1'>{hoveredReservation.time}</div>
            <div className='px-2 py-1 text-gray-200'>Student: {hoveredReservation.studentId}</div>
            <div className='px-2 py-1 text-gray-200'>Instructor: {hoveredReservation.instructorId}</div>
            <div className='px-2 py-1 text-gray-200'>Aircraft: {hoveredReservation.aircraftId}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlightReservation;
