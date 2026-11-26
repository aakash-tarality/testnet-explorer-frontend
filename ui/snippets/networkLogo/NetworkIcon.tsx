import { chakra } from '@chakra-ui/react';
import React from 'react';

import { route } from 'nextjs-routes';

import config from 'configs/app';
import { useColorModeValue } from 'toolkit/chakra/color-mode';
import { Image } from 'toolkit/chakra/image';
import IconSvg from 'ui/shared/IconSvg';

import { INVERT_FILTER } from './consts';

const IconFallback = () => {
  return (
    <IconSvg
      name="networks/icon-placeholder"
      w="25px"
      h="25px"
      color={{ base: 'blue.600', _dark: 'white' }}
      aria-label="Network icon placeholder"
    />
  );
};

type Props = {
  className?: string;
};



const NetworkIcon = ({ className }: Props) => {
  const iconSrc = useColorModeValue('/icons/LogoLight.svg', '/icons/Logo.svg');

  return (
    <chakra.a
      className={className}
      href={route({ pathname: '/' })}
      aria-label="Link to main page"
      display="flex"
      alignItems="center"
    >
      <Image
        w="auto"
        h="25px"
        src={iconSrc}
        alt="nowa Logo"
        fallback={<IconFallback />}
        objectFit="contain"
        objectPosition="center"
      />
    </chakra.a>
  );
};

export default React.memo(chakra(NetworkIcon));


