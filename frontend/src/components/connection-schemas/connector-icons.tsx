/** SVG symbol defs for all 42 connector types. Render <ConnectorIconDefs> inside SVG <defs>, then use <ConnectorIconUse> on ports. */

export function ConnectorIconDefs() {
  return (
    <>
      <symbol id="ci-HDMI" viewBox="0 0 64 64">
        <g fill="none" stroke="#3F3F3F" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#3F3F3F">
          <path d="M17 15 H47 V25 L41 37 H23 L17 25 Z"/><path d="M22 21 H42"/>
        </g>
      </symbol>
      <symbol id="ci-SDI" viewBox="0 0 64 64">
        <g fill="none" stroke="#6FA8DC" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#6FA8DC">
          <circle cx={32} cy={25} r={13}/><circle cx={32} cy={25} r={4.5}/><circle cx={32} cy={25} r={1.6} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-DISPLAYPORT" viewBox="0 0 64 64">
        <g fill="none" stroke="#E8B647" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#E8B647">
          <path d="M18 15 H46 V31 L40 37 H18 Z"/>
          <circle cx={24} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={28} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={36} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={40} cy={22} r={1.4} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-DVI" viewBox="0 0 64 64">
        <g fill="none" stroke="#B8860B" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#B8860B">
          <rect x={16} y={14} width={30} height={22} rx={2}/>
          <circle cx={22} cy={19} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={19} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={19} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={22} cy={25} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={25} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={25} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={22} cy={31} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={31} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={31} r={1.5} fill="currentColor" stroke="none"/>
          <rect x={38} y={18} width={4} height={14} rx={1}/>
        </g>
      </symbol>
      <symbol id="ci-VGA" viewBox="0 0 64 64">
        <g fill="none" stroke="#4A4A4A" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#4A4A4A">
          <path d="M16 16 H48 L45 34 H19 Z"/>
          <circle cx={22} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={37} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={42} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={24} cy={29} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={29} cy={29} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={34} cy={29} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={39} cy={29} r={1.4} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-GENLOCK" viewBox="0 0 64 64">
        <g fill="none" stroke="#8C8C8C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#8C8C8C">
          <circle cx={32} cy={25} r={13}/><path d="M24 25 h4 l2.5 -5 5 10 2.5 -5 h4"/>
        </g>
      </symbol>
      <symbol id="ci-FIBER" viewBox="0 0 64 64">
        <g fill="none" stroke="#CC0000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#CC0000">
          <rect x={18} y={14} width={9} height={15} rx={2}/><rect x={37} y={14} width={9} height={15} rx={2}/>
          <path d="M22.5 29 V37 M41.5 29 V37"/>
        </g>
      </symbol>
      <symbol id="ci-NDI" viewBox="0 0 64 64">
        <g fill="none" stroke="#2A9DF4" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#2A9DF4">
          <path d="M19 16 H45 V34 H19 Z"/><path d="M28 16 V11 H36 V16"/>
          <circle cx={23} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={31} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={41} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <path d="M32 34 V40"/>
          <g transform="translate(40,32)">
            <circle cx={0} cy={0} r={6.5} fill="currentColor" stroke="none"/>
            <path d="M-2 -3 L4 0 -2 3 Z" fill="#fff" stroke="none"/>
          </g>
        </g>
      </symbol>
      <symbol id="ci-XLR" viewBox="0 0 64 64">
        <g fill="none" stroke="#6FCF4D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#6FCF4D">
          <circle cx={32} cy={24} r={14}/>
          <circle cx={32} cy={18} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={26} cy={28} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={38} cy={28} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-RCA" viewBox="0 0 64 64">
        <g fill="none" stroke="#1B7A1B" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#1B7A1B">
          <circle cx={32} cy={24} r={12}/><path d="M32 16 V32"/>
        </g>
      </symbol>
      <symbol id="ci-JACK" viewBox="0 0 64 64">
        <g fill="none" stroke="#2DD4C4" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#2DD4C4">
          <path d="M44 21 H24 a4 4 0 0 0 0 8 H44"/>
          <circle cx={46} cy={25} r={3} fill="currentColor" stroke="none"/>
          <path d="M30 23 V27 M36 23 V27"/>
        </g>
      </symbol>
      <symbol id="ci-XLR_JACK" viewBox="0 0 64 64">
        <g fill="none" stroke="#26C2B3" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#26C2B3">
          <circle cx={25} cy={24} r={11}/>
          <circle cx={25} cy={19} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={21} cy={27} r={1.5} fill="currentColor" stroke="none"/>
          <circle cx={29} cy={27} r={1.5} fill="currentColor" stroke="none"/>
          <path d="M36 24 H46"/>
          <circle cx={47} cy={24} r={2.4} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-MINI_JACK" viewBox="0 0 64 64">
        <g fill="none" stroke="#0F9D77" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#0F9D77">
          <path d="M43 22 H28 a3 3 0 0 0 0 6 H43"/>
          <circle cx={45} cy={25} r={2.4} fill="currentColor" stroke="none"/>
          <path d="M34 23.5 V26.5"/>
        </g>
      </symbol>
      <symbol id="ci-AES_EBU" viewBox="0 0 64 64">
        <g fill="none" stroke="#3D8B8B" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#3D8B8B">
          <circle cx={32} cy={24} r={14}/>
          <circle cx={32} cy={18} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={26} cy={28} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={38} cy={28} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-TOSLINK" viewBox="0 0 64 64">
        <g fill="none" stroke="#D4622D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#D4622D">
          <rect x={20} y={13} width={24} height={24} rx={3}/>
          <rect x={27} y={20} width={10} height={10} rx={1.5}/>
          <path d="M48 17 l4 -3 M48 25 h5 M48 33 l4 3"/>
        </g>
      </symbol>
      <symbol id="ci-SPDIF_COAX" viewBox="0 0 64 64">
        <g fill="none" stroke="#C97A3D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#C97A3D">
          <circle cx={32} cy={24} r={12}/>
          <circle cx={32} cy={24} r={3.2} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-SPEAKON" viewBox="0 0 64 64">
        <g fill="none" stroke="#7B1FA2" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#7B1FA2">
          <circle cx={32} cy={25} r={13}/><circle cx={32} cy={25} r={3}/>
          <circle cx={32} cy={18} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={39} cy={25} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={32} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={25} cy={25} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-DANTE" viewBox="0 0 64 64">
        <g fill="none" stroke="#00A7B5" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#00A7B5">
          <path d="M19 16 H45 V34 H19 Z"/><path d="M28 16 V11 H36 V16"/>
          <circle cx={23} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={31} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={41} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <path d="M32 34 V40"/>
          <g transform="translate(40,32)">
            <circle cx={0} cy={0} r={6.5} fill="currentColor" stroke="none"/>
            <path d="M-3 0 q1.5 -3 3 0 t3 0" fill="none" stroke="#fff" strokeWidth={1.6}/>
          </g>
        </g>
      </symbol>
      <symbol id="ci-AES67" viewBox="0 0 64 64">
        <g fill="none" stroke="#008C99" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#008C99">
          <path d="M19 16 H45 V34 H19 Z"/><path d="M28 16 V11 H36 V16"/>
          <circle cx={23} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={31} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={41} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <path d="M32 34 V40"/>
          <g transform="translate(40,32)">
            <circle cx={0} cy={0} r={6.5} fill="currentColor" stroke="none"/>
            <path d="M-3 0 q1.5 -3 3 0 t3 0" fill="none" stroke="#fff" strokeWidth={1.6}/>
          </g>
        </g>
      </symbol>
      <symbol id="ci-MIDI" viewBox="0 0 64 64">
        <g fill="none" stroke="#CC1111" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#CC1111">
          <circle cx={32} cy={25} r={14}/>
          <path d="M28 16 a8 8 0 0 1 8 0"/>
          <circle cx={24} cy={24} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={40} cy={24} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={28} cy={33} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={36} cy={33} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={21} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-DMX" viewBox="0 0 64 64">
        <g fill="none" stroke="#E08080" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#E08080">
          <circle cx={32} cy={25} r={14}/>
          <circle cx={32} cy={18} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={24} cy={23} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={40} cy={23} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={32} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={37} cy={32} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-ARTNET" viewBox="0 0 64 64">
        <g fill="none" stroke="#D88A4A" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#D88A4A">
          <path d="M19 16 H45 V34 H19 Z"/><path d="M28 16 V11 H36 V16"/>
          <circle cx={23} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={31} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={41} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <path d="M32 34 V40"/>
          <g transform="translate(40,32)">
            <circle cx={0} cy={0} r={6.5} fill="currentColor" stroke="none"/>
            <circle cx={0} cy={-1} r={2.4} fill="none" stroke="#fff" strokeWidth={1.4}/>
            <path d="M-1.5 3 H1.5" stroke="#fff" strokeWidth={1.4}/>
          </g>
        </g>
      </symbol>
      <symbol id="ci-SACN" viewBox="0 0 64 64">
        <g fill="none" stroke="#CC8B52" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#CC8B52">
          <path d="M19 16 H45 V34 H19 Z"/><path d="M28 16 V11 H36 V16"/>
          <circle cx={23} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={31} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={41} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <path d="M32 34 V40"/>
          <g transform="translate(40,32)">
            <circle cx={0} cy={0} r={6.5} fill="currentColor" stroke="none"/>
            <circle cx={0} cy={-1} r={2.4} fill="none" stroke="#fff" strokeWidth={1.4}/>
            <path d="M-1.5 3 H1.5" stroke="#fff" strokeWidth={1.4}/>
          </g>
        </g>
      </symbol>
      <symbol id="ci-RS232" viewBox="0 0 64 64">
        <g fill="none" stroke="#707070" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#707070">
          <path d="M16 17 H48 L45 33 H19 Z"/>
          <circle cx={23} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={28} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={33} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={38} cy={22} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={25} cy={29} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={30} cy={29} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={29} r={1.4} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-RS485" viewBox="0 0 64 64">
        <g fill="none" stroke="#5C5C5C" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#5C5C5C">
          <rect x={18} y={18} width={28} height={14} rx={2}/>
          <circle cx={25} cy={25} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={25} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={39} cy={25} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-ETHERNET" viewBox="0 0 64 64">
        <g fill="none" stroke="#1C4FA0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#1C4FA0">
          <path d="M19 16 H45 V34 H19 Z"/><path d="M28 16 V11 H36 V16"/>
          <circle cx={23} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={27} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={31} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <circle cx={41} cy={20} r={1.4} fill="currentColor" stroke="none"/>
          <path d="M32 34 V40"/>
        </g>
      </symbol>
      <symbol id="ci-ETHERCON" viewBox="0 0 64 64">
        <g fill="none" stroke="#1C4FA0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#1C4FA0">
          <circle cx={32} cy={25} r={15}/>
          <path d="M26 21 H38 V31 H26 Z"/><path d="M30 21 V18 H34 V21"/>
          <circle cx={29} cy={24} r={1.3} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={24} r={1.3} fill="currentColor" stroke="none"/>
          <circle cx={35} cy={24} r={1.3} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-USB" viewBox="0 0 64 64">
        <g fill="none" stroke="#D946C0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#D946C0">
          <rect x={18} y={14} width={28} height={20} rx={2}/>
          <rect x={23} y={19} width={8} height={4} fill="currentColor" stroke="none"/>
          <path d="M35 19 H41 M35 24 H41"/>
          <path d="M32 34 V39"/>
        </g>
      </symbol>
      <symbol id="ci-USB_C" viewBox="0 0 64 64">
        <g fill="none" stroke="#C13FB0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#C13FB0">
          <rect x={16} y={19} width={32} height={13} rx={6.5}/>
          <rect x={22} y={23.5} width={20} height={4} rx={2} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-THUNDERBOLT" viewBox="0 0 64 64">
        <g fill="none" stroke="#6A1B9A" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#6A1B9A">
          <rect x={16} y={24} width={32} height={11} rx={5.5}/>
          <rect x={22} y={27.5} width={20} height={4} rx={2} fill="currentColor" stroke="none"/>
          <path d="M35 7 L28 17 H32 L30 21 L38 12 H33 Z" fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-FIREWIRE" viewBox="0 0 64 64">
        <g fill="none" stroke="#C0C0C0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#C0C0C0">
          <path d="M19 17 H45 V33 H26 L19 27 Z"/><path d="M26 23 H40"/>
        </g>
      </symbol>
      <symbol id="ci-LIGHTNING" viewBox="0 0 64 64">
        <g fill="none" stroke="#4CD964" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#4CD964">
          <rect x={20} y={20} width={24} height={11} rx={3}/>
          <circle cx={25} cy={25.5} r={1.3} fill="currentColor" stroke="none"/>
          <circle cx={30} cy={25.5} r={1.3} fill="currentColor" stroke="none"/>
          <circle cx={34} cy={25.5} r={1.3} fill="currentColor" stroke="none"/>
          <circle cx={39} cy={25.5} r={1.3} fill="currentColor" stroke="none"/>
          <path d="M44 25.5 H49"/>
        </g>
      </symbol>
      <symbol id="ci-POWER" viewBox="0 0 64 64">
        <g fill="none" stroke="#2E5FA8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#2E5FA8">
          <rect x={22} y={24} width={20} height={14} rx={3}/>
          <path d="M28 24 V13 M36 24 V13"/>
        </g>
      </symbol>
      <symbol id="ci-POWERCON" viewBox="0 0 64 64">
        <g fill="none" stroke="#E040FB" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#E040FB">
          <circle cx={32} cy={25} r={13}/><circle cx={32} cy={25} r={3}/>
          <circle cx={27} cy={28} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={37} cy={28} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={19} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-IEC" viewBox="0 0 64 64">
        <g fill="none" stroke="#4A4A90" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#4A4A90">
          <path d="M22 16 H42 L46 22 V32 H18 V22 Z"/>
          <circle cx={25} cy={25} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={32} cy={25} r={1.8} fill="currentColor" stroke="none"/>
          <circle cx={39} cy={25} r={1.8} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-SCHUKO" viewBox="0 0 64 64">
        <g fill="none" stroke="#3A6FB5" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#3A6FB5">
          <circle cx={32} cy={25} r={14}/>
          <circle cx={26} cy={25} r={2.4} fill="currentColor" stroke="none"/>
          <circle cx={38} cy={25} r={2.4} fill="currentColor" stroke="none"/>
          <path d="M28 17 H36 M28 33 H36"/>
        </g>
      </symbol>
      <symbol id="ci-EDISON" viewBox="0 0 64 64">
        <g fill="none" stroke="#2D5FA0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#2D5FA0">
          <rect x={22} y={24} width={20} height={14} rx={2}/>
          <rect x={27} y={12} width={3.5} height={12} rx={1} fill="currentColor" stroke="none"/>
          <rect x={34} y={12} width={3.5} height={12} rx={1} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-BANANA" viewBox="0 0 64 64">
        <g fill="none" stroke="#B5651D" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#B5651D">
          <path d="M32 11 V19"/>
          <ellipse cx={32} cy={27} rx={5.5} ry={8}/>
          <path d="M32 35 V39"/>
        </g>
      </symbol>
      <symbol id="ci-TERMINAL_BLOCK" viewBox="0 0 64 64">
        <g fill="none" stroke="#8C6E4A" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#8C6E4A">
          <rect x={16} y={20} width={32} height={14} rx={2}/>
          <circle cx={22} cy={27} r={3}/><circle cx={32} cy={27} r={3}/><circle cx={42} cy={27} r={3}/>
          <path d="M20.3 27 H23.7 M30.3 27 H33.7 M40.3 27 H43.7"/>
          <path d="M22 34 V39 M32 34 V39 M42 34 V39"/>
        </g>
      </symbol>
      <symbol id="ci-WIRELESS" viewBox="0 0 64 64">
        <g fill="none" stroke="#7CA8DC" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#7CA8DC">
          <path d="M32 38 V22"/>
          <path d="M24 16 a11 11 0 0 1 16 0"/>
          <path d="M20 12 a17 17 0 0 1 24 0"/>
          <circle cx={32} cy={22} r={2.4} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-WIFI" viewBox="0 0 64 64">
        <g fill="none" stroke="#5B9BD5" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#5B9BD5">
          <path d="M18 19 a20 20 0 0 1 28 0"/>
          <path d="M23 25 a13 13 0 0 1 18 0"/>
          <path d="M28 31 a6 6 0 0 1 8 0"/>
          <circle cx={32} cy={36} r={2} fill="currentColor" stroke="none"/>
        </g>
      </symbol>
      <symbol id="ci-BLUETOOTH" viewBox="0 0 64 64">
        <g fill="none" stroke="#2F5FCB" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" color="#2F5FCB">
          <polyline points="25.6 18.6 38.4 31.4 32 37.9 32 12.1 38.4 18.6 25.6 31.4"/>
        </g>
      </symbol>
    </>
  );
}

/** Renders a connector icon at (x,y) with given size using SVG symbols defined by ConnectorIconDefs. */
export function ConnectorIconUse({ code, x = 0, y = 0, size = 14 }: {
  code: string;
  x?: number;
  y?: number;
  size?: number;
}) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 64 64" overflow="visible" pointerEvents="none">
      <use href={`#ci-${code}`} />
    </svg>
  );
}
